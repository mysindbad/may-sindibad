#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const warnings = [];
const passes = [];
const note = (arr, msg) => arr.push(msg);
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.next'].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p); else files.push(p);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'test'));

// 1. Visual hard lock
const lockFile = path.join(root, '.qa/visual-lock.sha256');
if (!fs.existsSync(lockFile)) {
  note(failures, 'Visual lock file is missing.');
} else {
  for (const line of fs.readFileSync(lockFile, 'utf8').trim().split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (!m) { note(failures, `Malformed visual lock line: ${line}`); continue; }
    const [, expected, rel] = m;
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) { note(failures, `Visual-locked file missing: ${rel}`); continue; }
    const actual = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    if (actual !== expected) note(failures, `Visual lock changed: ${rel}`);
  }
  if (!failures.some(x => x.startsWith('Visual'))) note(passes, 'Visual hard-lock hashes match.');
}

// 2. Environment coverage
const envRefs = new Set();
for (const file of files.concat([path.join(root, 'drizzle.config.ts'), path.join(root, 'next.config.ts')])) {
  if (!fs.existsSync(file) || !/\.(ts|tsx|js|mjs)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) envRefs.add(m[1]);
}
const envExample = path.join(root, '.env.example');
const declared = new Set();
if (fs.existsSync(envExample)) {
  for (const line of fs.readFileSync(envExample, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=/); if (m) declared.add(m[1]);
  }
}
for (const key of envRefs) if (key !== 'NODE_ENV' && !declared.has(key)) note(failures, `.env.example missing ${key}`);
if (!failures.some(x => x.includes('.env.example'))) note(passes, `Environment contract covers ${[...envRefs].filter(k => k !== 'NODE_ENV').length} referenced variables.`);

// 3. Secret scan
const secretPatterns = [
  [/\bsk_live_[A-Za-z0-9_-]{12,}\b/g, 'Stripe live secret'],
  [/\bsk_test_[A-Za-z0-9_-]{20,}\b/g, 'Stripe test secret'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, 'GitHub token'],
  [/\bAIza[0-9A-Za-z_-]{25,}\b/g, 'Google API key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, 'Private key'],
];
for (const file of files.concat([envExample, path.join(root, 'README.md')])) {
  if (!file || !fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const [re, label] of secretPatterns) {
    re.lastIndex = 0;
    if (re.test(text)) note(failures, `${label} pattern found in ${path.relative(root, file)}`);
  }
}
if (!failures.some(x => /secret|token|API key|Private key/.test(x))) note(passes, 'No obvious production secret pattern found in tracked source/docs.');

// 4. Local import resolution
function resolvesImport(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(root, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return true;
  const candidates = [base, ...['.ts','.tsx','.js','.jsx','.json','.mjs','.cjs'].map(e => base + e), ...['index.ts','index.tsx','index.js','index.jsx'].map(n => path.join(base,n))];
  return candidates.some(p => fs.existsSync(p) && fs.statSync(p).isFile());
}
let importCount = 0;
for (const file of files.filter(f => /\.(ts|tsx|js|mjs)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  const specs = [];
  for (const m of text.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)) specs.push(m[1]);
  for (const spec of specs) {
    if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
    importCount++;
    if (!resolvesImport(file, spec)) note(failures, `Broken local import ${spec} in ${path.relative(root,file)}`);
  }
}
if (!failures.some(x => x.startsWith('Broken local import'))) note(passes, `${importCount} local imports resolve.`);

// 5. PWA referenced assets
const manifestPath = path.join(root, 'public/manifest.webmanifest');
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const icon of manifest.icons ?? []) {
      const rel = String(icon.src ?? '').replace(/^\//, '');
      if (rel && !fs.existsSync(path.join(root, 'public', rel))) note(failures, `Manifest asset missing: /${rel}`);
    }
    if (!failures.some(x => x.startsWith('Manifest asset'))) note(passes, 'Manifest icon references exist.');
  } catch (e) { note(failures, `Invalid manifest.webmanifest JSON: ${e.message}`); }
}

// 6. TypeScript syntax and dictionary parity, using local/global TypeScript when available
let ts = null;
try {
  const req = createRequire(import.meta.url);
  try { ts = req(path.join(root, 'node_modules/typescript/lib/typescript.js')); }
  catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 5000 }).trim();
    ts = req(path.join(globalRoot, 'typescript/lib/typescript.js'));
  }
} catch (e) { note(warnings, `TypeScript syntax/i18n evaluator unavailable: ${e.message}`); }

if (ts) {
  let syntaxFiles = 0;
  for (const file of files.filter(f => /\.(ts|tsx)$/.test(f))) {
    const text = fs.readFileSync(file, 'utf8');
    const out = ts.transpileModule(text, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      reportDiagnostics: true,
      fileName: file,
    });
    syntaxFiles++;
    for (const d of out.diagnostics ?? []) {
      if (d.category === ts.DiagnosticCategory.Error) {
        const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
        note(failures, `TS syntax ${path.relative(root,file)}: ${msg}`);
      }
    }
  }
  if (!failures.some(x => x.startsWith('TS syntax'))) note(passes, `${syntaxFiles} TypeScript/TSX files transpile syntactically.`);

  const locales = ['en','ar','fr','es','de','ru'];
  function loadDict(locale) {
    const file = path.join(root, `src/i18n/dictionaries/${locale}.ts`);
    const source = fs.readFileSync(file, 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const sandbox = { exports: {}, module: { exports: {} }, require: () => ({}) };
    sandbox.module.exports = sandbox.exports;
    vm.runInNewContext(js, sandbox, { filename: file });
    return sandbox.exports[locale] ?? sandbox.module.exports[locale] ?? sandbox.exports.default ?? sandbox.module.exports.default;
  }
  function flatten(obj, prefix='', out=new Set()) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    for (const [k,v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v,p,out); else out.add(p);
    }
    return out;
  }
  try {
    const base = flatten(loadDict('en'));
    for (const locale of locales.slice(1)) {
      const keys = flatten(loadDict(locale));
      const missing = [...base].filter(k => !keys.has(k));
      const extra = [...keys].filter(k => !base.has(k));
      if (missing.length || extra.length) note(failures, `i18n ${locale}: missing=${missing.length} extra=${extra.length}`);
    }
    if (!failures.some(x => x.startsWith('i18n'))) note(passes, `i18n key parity holds across ${locales.join(', ')} (${base.size} leaf keys).`);
  } catch (e) { note(failures, `i18n evaluation failed: ${e.message}`); }
}

// 7. Mutation-route auth guard inventory
const apiRoot = path.join(root, 'src/app/api');
const apiRoutes = [];
function walkApi(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,ent.name);
    if (ent.isDirectory()) walkApi(p); else if (ent.name==='route.ts') apiRoutes.push(p);
  }
}
walkApi(apiRoot);
const anonymousMutationAllow = [
  '/api/auth/login', '/api/auth/signup', '/api/auth/logout', '/api/payments/webhook'
];
for (const file of apiRoutes) {
  const text = fs.readFileSync(file,'utf8');
  const rel = '/' + path.relative(path.join(root,'src/app'), path.dirname(file)).split(path.sep).join('/');
  const methods = [...text.matchAll(/export async function (POST|PUT|PATCH|DELETE)\b/g)].map(m=>m[1]);
  if (!methods.length) continue;
  if (anonymousMutationAllow.includes(rel) || rel.startsWith('/api/auth/google/')) continue;
  const guarded = /\b(requireUser|getCurrentUser|getOwnerContext|resolveOwnerContext)\b/.test(text);
  if (!guarded) note(failures, `Mutation API lacks visible auth/owner guard: ${rel} [${methods.join(',')}]`);
}
if (!failures.some(x => x.startsWith('Mutation API'))) note(passes, `Mutation API inventory (${apiRoutes.length} routes) has explicit auth/owner guards except allowlisted auth/webhook endpoints.`);

// 8. Shared rate limiter must be awaited at every API call site.
for (const file of apiRoutes) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('checkRateLimit(')) continue;
  const calls = [...text.matchAll(/checkRateLimit\(/g)].length;
  const awaited = [...text.matchAll(/await\s+checkRateLimit\(/g)].length;
  if (calls !== awaited) note(failures, `Rate limiter call is not awaited in ${path.relative(root, file)} (${awaited}/${calls})`);
}
const rateLimitSource = path.join(root, 'src/lib/rate-limit.ts');
if (!fs.existsSync(rateLimitSource) || !fs.readFileSync(rateLimitSource, 'utf8').includes('rate_limit_buckets')) {
  note(failures, 'Shared PostgreSQL rate-limit storage is not wired.');
}
if (!failures.some(x => x.startsWith('Rate limiter') || x.startsWith('Shared PostgreSQL'))) note(passes, 'All API rate-limit checks await the shared PostgreSQL limiter.');


// 9. Mixed/public response DTOs must not fall back to full-row selects that
// expose internal ownership or moderation fields.
const favoritesRoute = path.join(root, 'src/app/api/favorites/route.ts');
if (fs.existsSync(favoritesRoute)) {
  const source = fs.readFileSync(favoritesRoute, 'utf8');
  if (/\.select\(\)\s*\.from\((?:favorites|places|providers)\)/s.test(source)) {
    note(failures, 'Favorites API contains an unprojected full-row select.');
  } else if (/createdByUserId|ownerUserId/.test(source)) {
    note(failures, 'Favorites API projection includes an internal owner identifier.');
  } else {
    note(passes, 'Favorites API uses explicit public/data-minimized projections.');
  }
}


const itineraryMutationRoute = path.join(root, 'src/app/api/itinerary-items/[id]/route.ts');
if (fs.existsSync(itineraryMutationRoute)) {
  const source = fs.readFileSync(itineraryMutationRoute, 'utf8');
  const writeTimeBookingGuard = source.includes('modifiesBookingProtectedField')
    && source.includes('isNull(itineraryItems.bookingId)')
    && source.includes('This activity changed while you were editing it');
  if (!writeTimeBookingGuard) {
    note(failures, 'Direct itinerary mutation can race a booking link and overwrite booking-protected fields.');
  } else {
    note(passes, 'Direct itinerary protected-field writes re-check booking linkage atomically at update time.');
  }
}

const adminContributionRoute = path.join(root, 'src/app/api/admin/contributions/[id]/route.ts');
if (fs.existsSync(adminContributionRoute)) {
  const source = fs.readFileSync(adminContributionRoute, 'utf8');
  const serializesModeration = source.includes('for update')
    && source.includes('await tx.select().from(contributions)')
    && source.includes('let placeId = current.placeId');
  if (!serializesModeration) {
    note(failures, 'Contribution moderation can race and duplicate a new_place before the contribution is linked.');
  } else {
    note(passes, 'Contribution moderation serializes each contribution before creating/linking an approved place.');
  }
}

const contributionsRoute = path.join(root, 'src/app/api/contributions/route.ts');
const contributionConfirmRoute = path.join(root, 'src/app/api/contributions/[id]/confirm/route.ts');
if (fs.existsSync(contributionsRoute) && fs.existsSync(contributionConfirmRoute)) {
  const source = fs.readFileSync(contributionsRoute, 'utf8');
  const confirmSource = fs.readFileSync(contributionConfirmRoute, 'utf8');
  if (!source.includes('toPublicContributionView') || !source.includes('toOwnerContributionView') || !confirmSource.includes('toPublicContributionView')) {
    note(failures, 'Community APIs do not consistently use client-safe contribution projections.');
  } else {
    note(passes, 'Community APIs keep submitter ids and moderation-only metadata behind the correct trust boundary.');
  }
}

const tripsRoute = path.join(root, 'src/app/api/trips/route.ts');
const tripDetailRoute = path.join(root, 'src/app/api/trips/[id]/route.ts');
if (fs.existsSync(tripsRoute) && fs.existsSync(tripDetailRoute)) {
  const listSource = fs.readFileSync(tripsRoute, 'utf8');
  const detailSource = fs.readFileSync(tripDetailRoute, 'utf8');
  if (!listSource.includes('toClientTripView') || !detailSource.includes('toClientTripView')) {
    note(failures, 'Trip APIs do not consistently strip userId/guestId before returning owner-authorized trips.');
  } else {
    note(passes, 'Trip APIs use the client-safe trip projection; guest ownership ids stay server-side.');
  }
}
const aiConversationListRoute = path.join(root, 'src/app/api/ai/conversations/route.ts');
const aiConversationDetailRoute = path.join(root, 'src/app/api/ai/conversations/[id]/route.ts');
const aiChatRoute = path.join(root, 'src/app/api/ai/chat/route.ts');
if (fs.existsSync(aiConversationListRoute) && fs.existsSync(aiConversationDetailRoute) && fs.existsSync(aiChatRoute)) {
  const listSource = fs.readFileSync(aiConversationListRoute, 'utf8');
  const detailSource = fs.readFileSync(aiConversationDetailRoute, 'utf8');
  const chatSource = fs.readFileSync(aiChatRoute, 'utf8');
  if (!listSource.includes('toClientConversationView') || !detailSource.includes('toClientConversationView') || !detailSource.includes('toClientMessageView') || !chatSource.includes('toClientMessageView')) {
    note(failures, 'AI conversation APIs do not consistently use client-safe conversation/message projections.');
  } else {
    note(passes, 'AI conversation APIs keep guest ownership ids and tool-call metadata server-side.');
  }
}

const bookingCreateRoute = path.join(root, 'src/app/api/bookings/route.ts');
if (fs.existsSync(bookingCreateRoute)) {
  const source = fs.readFileSync(bookingCreateRoute, 'utf8');
  if (!source.includes('isSupportedBookingTotal(totalAmount)')) {
    note(failures, 'Booking creation does not guard calculated totals against numeric(10,2) storage overflow.');
  } else {
    note(passes, 'Booking creation rejects calculated totals that exceed numeric(10,2) storage capacity.');
  }
}

const travelerBookingsRoute = path.join(root, 'src/app/api/bookings/route.ts');
const travelerBookingDetailRoute = path.join(root, 'src/app/api/bookings/[id]/route.ts');
const paymentIntentRoute = path.join(root, 'src/app/api/payments/create-intent/route.ts');
if (fs.existsSync(travelerBookingsRoute) && fs.existsSync(travelerBookingDetailRoute)) {
  const listSource = fs.readFileSync(travelerBookingsRoute, 'utf8');
  const detailSource = fs.readFileSync(travelerBookingDetailRoute, 'utf8');
  if (!listSource.includes('toUserBookingView') || !detailSource.includes('toUserBookingView')) {
    note(failures, 'Traveler booking APIs do not consistently use the data-minimized traveler booking projection.');
  } else {
    note(passes, 'Traveler booking APIs use the data-minimized traveler booking projection.');
  }
}
if (fs.existsSync(paymentIntentRoute)) {
  const source = fs.readFileSync(paymentIntentRoute, 'utf8');
  if (!source.includes('toClientPaymentView(payment)')) {
    note(failures, 'Payment intent API does not minimize persisted payment rows before returning them to the browser.');
  } else {
    note(passes, 'Payment intent API uses the data-minimized client payment projection.');
  }
}

const placesSearchRoute = path.join(root, 'src/app/api/places/route.ts');
const providersSearchRoute = path.join(root, 'src/app/api/providers/route.ts');
if (fs.existsSync(placesSearchRoute) && fs.existsSync(providersSearchRoute)) {
  const placesSource = fs.readFileSync(placesSearchRoute, 'utf8');
  const providersSource = fs.readFileSync(providersSearchRoute, 'utf8');
  const placesBounded = placesSource.includes('Math.min(Math.max(Math.trunc(requestedLimit), 1), 60)') && placesSource.includes('Search parameters are too long.');
  const providersBounded = providersSource.includes('Search parameters are too long.');
  if (!placesBounded || !providersBounded) {
    note(failures, 'Public place/provider search parameters are not consistently length/limit bounded.');
  } else {
    note(passes, 'Public place/provider search parameters are length bounded and place result limits cannot become negative.');
  }
}

const reviewsRoute = path.join(root, 'src/app/api/reviews/route.ts');
if (fs.existsSync(reviewsRoute)) {
  const source = fs.readFileSync(reviewsRoute, 'utf8');
  if (!source.includes('eq(providers.ownerUserId, user.id)') || !source.includes('provider.ownerUserId === user.id') || !source.includes('You can\'t review your own business.')) {
    note(failures, 'Review API does not consistently prevent provider owners from rating their own provider/place surfaces.');
  } else {
    note(passes, 'Review API prevents provider owners from self-rating their business or provider-linked place.');
  }
}

const providerBookingsRoute = path.join(root, 'src/app/api/provider-bookings/route.ts');
const providerBookingDetailRoute = path.join(root, 'src/app/api/provider-bookings/[id]/route.ts');
if (fs.existsSync(providerBookingsRoute) && fs.existsSync(providerBookingDetailRoute)) {
  const listSource = fs.readFileSync(providerBookingsRoute, 'utf8');
  const detailSource = fs.readFileSync(providerBookingDetailRoute, 'utf8');
  if (!listSource.includes('toProviderBookingView(booking)') || !detailSource.includes('toProviderBookingView(result)')) {
    note(failures, 'Provider booking APIs do not consistently use the data-minimized provider booking projection.');
  } else {
    note(passes, 'Provider booking APIs use the data-minimized provider booking projection.');
  }
}

// Browser cookie-auth mutations must reject cross-origin CSRF attempts.
const mutationOriginMissing = [];
for (const file of files.filter((file) => file.includes(`${path.sep}src${path.sep}app${path.sep}api${path.sep}`) && file.endsWith(`${path.sep}route.ts`))) {
  const rel = path.relative(root, file);
  if (rel === path.join('src', 'app', 'api', 'payments', 'webhook', 'route.ts')) continue; // Stripe signature is the webhook authenticity boundary.
  const source = fs.readFileSync(file, 'utf8');
  const handlers = source.match(/export async function (?:POST|PUT|PATCH|DELETE)\s*\(/g) ?? [];
  if (!handlers.length) continue;
  const guards = source.match(/isTrustedMutationRequest\(request\)/g) ?? [];
  if (guards.length < handlers.length) mutationOriginMissing.push(`${rel} (${guards.length}/${handlers.length})`);
}
if (mutationOriginMissing.length) {
  note(failures, `Mutation routes missing exact-origin/Fetch-Metadata CSRF guards: ${mutationOriginMissing.join(', ')}`);
} else {
  note(passes, 'Browser-facing mutation handlers enforce the shared exact-origin/Fetch-Metadata CSRF boundary (Stripe webhook exempt by signature).');
}

// All inbound JSON mutation requests must be byte-bounded before JSON parsing.
const apiRouteFiles = files.filter((file) => file.includes(`${path.sep}src${path.sep}app${path.sep}api${path.sep}`) && file.endsWith(`${path.sep}route.ts`));
const rawJsonRequestRoutes = [];
for (const file of apiRouteFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (/\brequest\.json\s*\(/.test(source)) rawJsonRequestRoutes.push(path.relative(root, file));
}
if (rawJsonRequestRoutes.length) {
  note(failures, `Inbound API routes still call request.json() without the shared byte bound: ${rawJsonRequestRoutes.join(', ')}`);
} else {
  note(passes, 'Inbound JSON API routes use the shared pre-parser byte bound; no raw request.json() calls remain.');
}

const stripeWebhookRoute = path.join(root, 'src/app/api/payments/webhook/route.ts');
if (fs.existsSync(stripeWebhookRoute)) {
  const source = fs.readFileSync(stripeWebhookRoute, 'utf8');
  if (source.includes('request.text()') || !source.includes('readRequestBodyWithLimit(request, 2 * 1024 * 1024)')) {
    note(failures, 'Stripe webhook raw body is not byte-bounded before signature verification.');
  } else {
    note(passes, 'Stripe webhook preserves raw signed bytes behind a 2 MiB pre-buffer ceiling.');
  }
}

const paymentProviderContract = path.join(root, 'src/lib/payments/provider.ts');
const paymentProviderFactory = path.join(root, 'src/lib/payments/index.ts');
if (fs.existsSync(paymentProviderContract) && fs.existsSync(paymentProviderFactory)) {
  const contractSource = fs.readFileSync(paymentProviderContract, 'utf8');
  const factorySource = fs.readFileSync(paymentProviderFactory, 'utf8');
  const requiresWebhook = contractSource.includes('process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET')
    && factorySource.includes('process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET');
  if (!requiresWebhook) {
    note(failures, 'Stripe Checkout can be advertised/created without the webhook secret required for authoritative payment reconciliation.');
  } else {
    note(passes, 'Stripe payment configuration fails closed unless both API and webhook secrets are present.');
  }
}

const paymentIntentRaceRoute = path.join(root, 'src/app/api/payments/create-intent/route.ts');
if (fs.existsSync(paymentIntentRaceRoute)) {
  const source = fs.readFileSync(paymentIntentRaceRoute, 'utf8');
  const hasLoserCleanup = source.includes('session.providerRef !== raced.providerRef')
    && source.includes('provider.cancelPaymentSession(session.providerRef)');
  if (!hasLoserCleanup) note(failures, 'Concurrent payment creation can leave a losing hosted checkout session open after the DB active-payment race is resolved.');
  else note(passes, 'Concurrent payment creation expires a distinct losing hosted checkout after the DB active-payment race is resolved.');

  const unusableSessionIndex = source.indexOf('Payment provider returned no usable checkout session.');
  const unusableSessionGuardIndex = source.indexOf('session.provider !== "demo" && !session.redirectUrl && !session.clientSecret');
  const cleanupBeforeUnusableReturn = source.lastIndexOf('provider.cancelPaymentSession(session.providerRef)', unusableSessionIndex);
  if (unusableSessionGuardIndex < 0 || unusableSessionIndex < 0 || cleanupBeforeUnusableReturn < unusableSessionGuardIndex) {
    note(failures, 'Malformed external payment sessions are rejected without best-effort provider cleanup.');
  } else {
    note(passes, 'Malformed external payment sessions are best-effort cancelled before the API rejects them.');
  }
}


const bookingActionsClient = path.join(root, 'src/components/bookings/BookingActions.tsx');
if (fs.existsSync(paymentIntentRaceRoute) && fs.existsSync(bookingActionsClient)) {
  const routeSource = fs.readFileSync(paymentIntentRaceRoute, 'utf8');
  const clientSource = fs.readFileSync(bookingActionsClient, 'utf8');
  const terminalKeyGuard = routeSource.includes('sameKey.status === "failed" || sameKey.status === "refunded"')
    && routeSource.includes('code: "payment_attempt_closed"');
  const rotatesClosedKey = clientSource.includes('setIdempotencyKey(')
    && clientSource.includes('data.code === "payment_attempt_closed"');
  if (!terminalKeyGuard || !rotatesClosedKey) {
    note(failures, 'Closed payment attempts can be replayed with the same browser idempotency key and stale hosted checkout URL.');
  } else {
    note(passes, 'Closed payment attempts reject stale idempotency replay and rotate the browser key for the next explicit retry.');
  }
}

const stripeWebhookLifecycleRoute = path.join(root, 'src/app/api/payments/webhook/route.ts');
if (fs.existsSync(stripeWebhookLifecycleRoute)) {
  const source = fs.readFileSync(stripeWebhookLifecycleRoute, 'utf8');
  if (!source.includes('checkout.session.expired') || !source.includes('event.type === "checkout.session.expired"')) {
    note(failures, 'Stripe webhook does not release expired Checkout sessions into a retryable failed payment state.');
  } else {
    note(passes, 'Stripe webhook handles Checkout expiration so stale hosted sessions do not permanently block payment retry.');
  }
}

if (fs.existsSync(stripeWebhookLifecycleRoute)) {
  const source = fs.readFileSync(stripeWebhookLifecycleRoute, 'utf8');
  const reconcilesItinerary = source.includes('itineraryLinkageMismatch')
    && source.includes('effectiveBooking.status === "confirmed"')
    && source.includes('.returning({ id: itineraryItems.id })')
    && source.includes('paidBookingStateMismatch')
    && source.includes('const reconciliationRequired = paidBookingStateMismatch || itineraryLinkageMismatch');
  if (!reconcilesItinerary) {
    note(failures, 'Succeeded Stripe webhooks can silently leave a booking/itinerary linkage inconsistent or miss a duplicate-webhook repair.');
  } else {
    note(passes, 'Succeeded Stripe webhooks idempotently repair valid itinerary state and flag booking/linkage mismatches for reconciliation.');
  }
}

const boundedBodySource = path.join(root, 'src/lib/http/bounded-body.ts');
if (fs.existsSync(boundedBodySource)) {
  const source = fs.readFileSync(boundedBodySource, 'utf8');
  if (!source.includes('DEFAULT_JSON_BODY_LIMIT_BYTES = 128 * 1024') || !source.includes('parseJsonBodyWithLimit')) {
    note(failures, 'Shared bounded JSON parser or its conservative 128 KiB default limit is missing.');
  } else {
    note(passes, 'Shared bounded JSON parser has the expected conservative 128 KiB default ceiling.');
  }
}

const uploadStorageSource = path.join(root, 'src/lib/storage/index.ts');
const uploadRouteSource = path.join(root, 'src/app/api/uploads/route.ts');
if (fs.existsSync(uploadStorageSource) && fs.existsSync(uploadRouteSource)) {
  const storageSource = fs.readFileSync(uploadStorageSource, 'utf8');
  const routeSource = fs.readFileSync(uploadRouteSource, 'utf8');
  if (!storageSource.includes('env.NODE_ENV !== "production"') || !storageSource.includes('UploadStorageUnavailableError') || !routeSource.includes('storage_unavailable')) {
    note(failures, 'Upload storage does not fail closed in production when only the local filesystem adapter exists.');
  } else {
    note(passes, 'Production uploads fail closed while the local filesystem adapter remains development-only.');
  }


  const cleansUpOrphan = routeSource.includes('deleteLocalStoredUpload(stored.url)')
    && routeSource.includes('Failed to clean up orphaned local upload after media insert failure')
    && routeSource.indexOf('deleteLocalStoredUpload(stored.url)') > routeSource.indexOf('.insert(media)');
  if (!cleansUpOrphan) {
    note(failures, 'Upload route does not best-effort delete a newly stored local file when the media DB insert fails.');
  } else {
    note(passes, 'Upload route best-effort removes local files when their media DB insert fails.');
  }
}

const authProviderClient = path.join(root, 'src/components/auth/AuthProvider.tsx');
const logoutButtonClient = path.join(root, 'src/components/auth/LogoutButton.tsx');
const itineraryBoardClient = path.join(root, 'src/components/trips/ItineraryBoard.tsx');
if ([authProviderClient, logoutButtonClient, itineraryBoardClient].every(fs.existsSync)) {
  const authSource = fs.readFileSync(authProviderClient, 'utf8');
  const logoutSource = fs.readFileSync(logoutButtonClient, 'utf8');
  const tripSource = fs.readFileSync(itineraryBoardClient, 'utf8');
  const logoutTruthful = authSource.includes('if (!res.ok) return false;')
    && authSource.includes('setUser(null);')
    && logoutSource.includes('if (!loggedOut)');
  const tripTruthful = tripSource.includes('if (!res.ok) {')
    && tripSource.includes('const res = await fetch(`/api/itinerary-items/${itemId}`')
    && tripSource.includes('const res = await fetch(`/api/trips/${trip.id}`, { method: "DELETE" })');
  if (!logoutTruthful || !tripTruthful) {
    note(failures, 'Client mutation flows can still present logout/trip state changes before the server confirms success.');
  } else {
    note(passes, 'Logout and itinerary/trip mutation clients update local/navigation state only after server success.');
  }
}

const reviewCreateRoute = path.join(root, 'src/app/api/reviews/route.ts');
const reportCreateRoute = path.join(root, 'src/app/api/reports/route.ts');
const uploadCreateRoute = path.join(root, 'src/app/api/uploads/route.ts');
if ([reviewCreateRoute, reportCreateRoute, uploadCreateRoute].every(fs.existsSync)) {
  const reviewSource = fs.readFileSync(reviewCreateRoute, 'utf8');
  const reportSource = fs.readFileSync(reportCreateRoute, 'utf8');
  const uploadSource = fs.readFileSync(uploadCreateRoute, 'utf8');
  const reviewMinimized = reviewSource.includes('id: review.id') && !reviewSource.includes('NextResponse.json({ review }');
  const reportMinimized = reportSource.includes('id: report.id') && !reportSource.includes('NextResponse.json({ report }');
  const uploadMinimized = uploadSource.includes('id: record.id') && !uploadSource.includes('NextResponse.json({ media: record }');
  if (!reviewMinimized || !reportMinimized || !uploadMinimized) {
    note(failures, 'Review/report/upload creation responses can expose whole persistence rows instead of explicit client-safe fields.');
  } else {
    note(passes, 'Review/report/upload creation responses use explicit client-safe field projections.');
  }
}

const googleStartRoute = path.join(root, 'src/app/api/auth/google/start/route.ts');
const googleCallbackRoute = path.join(root, 'src/app/api/auth/google/callback/route.ts');
if (fs.existsSync(googleStartRoute) && fs.existsSync(googleCallbackRoute)) {
  const startSource = fs.readFileSync(googleStartRoute, 'utf8');
  const callbackSource = fs.readFileSync(googleCallbackRoute, 'utf8');
  const unsafeHostFallback = startSource.includes('appOrigin ?? request.nextUrl.origin')
    || callbackSource.includes('getTrustedAppOrigin(request.nextUrl.origin) ?? request.nextUrl.origin');
  const failClosed = startSource.includes('Google sign-in is not configured for this deployment.')
    && callbackSource.includes('Google sign-in is not configured for this deployment.');
  if (unsafeHostFallback || !failClosed) {
    note(failures, 'Google OAuth can fall back to the request Host when the canonical production origin is unavailable.');
  } else {
    note(passes, 'Google OAuth fails closed instead of trusting the request Host when canonical origin configuration is unavailable.');
  }
}

const accountRoute = path.join(root, 'src/app/api/account/route.ts');
const settingsForm = path.join(root, 'src/components/settings/SettingsForm.tsx');
if (fs.existsSync(accountRoute) && fs.existsSync(settingsForm)) {
  const accountSource = fs.readFileSync(accountRoute, 'utf8');
  const settingsSource = fs.readFileSync(settingsForm, 'utf8');
  const deleteStart = accountSource.indexOf('export async function DELETE');
  const deleteSource = deleteStart >= 0 ? accountSource.slice(deleteStart) : '';
  if (!deleteSource.includes('requireFreshUser()') || !deleteSource.includes('reauth_required') || !settingsSource.includes('reauth_required')) {
    note(failures, 'Account deletion does not consistently require and handle recent reauthentication.');
  } else {
    note(passes, 'Account deletion requires a recent authenticated session and routes stale sessions through reauthentication.');
  }

  const protectsActiveBookings = deleteSource.includes('select id from users where id = ${user.id} for update')
    && deleteSource.includes('select id from providers where owner_user_id = ${user.id} for update')
    && deleteSource.includes('const activeBookingStatuses: BookingStatus[] = ["draft", "pending", "awaiting_payment", "confirmed"]')
    && deleteSource.includes('throw new ActiveAccountBookingError()')
    && deleteSource.includes('code: "active_bookings"');
  if (!protectsActiveBookings) {
    note(failures, 'Account deletion can anonymize/destroy traveler or provider context while operational bookings are still active.');
  } else {
    note(passes, 'Account deletion serializes ownership and refuses to break active traveler/provider bookings.');
  }
}

// Provider coordinates must never persist as a half-pair.
const providerValidationSource = path.join(root, 'src/lib/validation.ts');
const providerRouteSource = path.join(root, 'src/app/api/providers/[id]/route.ts');
const schemaSource = path.join(root, 'src/db/schema.ts');
const baselineSql = path.join(root, 'drizzle/0000_baseline.sql');
const coordinateMigration = path.join(root, 'drizzle/0008_provider_coordinate_pair.sql');
if ([providerValidationSource, providerRouteSource, schemaSource, baselineSql, coordinateMigration].every(fs.existsSync)) {
  const validationSource = fs.readFileSync(providerValidationSource, 'utf8');
  const routeSource = fs.readFileSync(providerRouteSource, 'utf8');
  const dbSchemaSource = fs.readFileSync(schemaSource, 'utf8');
  const baseSql = fs.readFileSync(baselineSql, 'utf8');
  const migrationSql = fs.readFileSync(coordinateMigration, 'utf8');
  const guarded = validationSource.includes('hasCompleteCoordinatePair(value.lat, value.lng)')
    && routeSource.includes('hasCompleteCoordinatePair(nextLat, nextLng)')
    && dbSchemaSource.includes('providers_coordinate_pair_check')
    && baseSql.includes('providers_coordinate_pair_check')
    && migrationSql.includes('VALIDATE CONSTRAINT providers_coordinate_pair_check');
  if (!guarded) note(failures, 'Provider latitude/longitude pair integrity is not consistently enforced across create/update/database boundaries.');
  else note(passes, 'Provider latitude/longitude pair integrity is enforced at create/update/database boundaries.');
}

// Guest data must be claimed before a login session is established. Otherwise a
// failed migration can return an error after the browser is already authenticated
// and hide its guest-owned work behind the new user owner context.
const authMigrationOrderingRoutes = [
  'src/app/api/auth/login/route.ts',
  'src/app/api/auth/signup/route.ts',
  'src/app/api/auth/google/callback/route.ts',
];
const badAuthMigrationOrder = [];
for (const rel of authMigrationOrderingRoutes) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  const migrateAt = source.indexOf('migrateGuestDataToUser(');
  const sessionAt = source.indexOf('createSession(');
  if (migrateAt < 0 || sessionAt < 0 || migrateAt > sessionAt) badAuthMigrationOrder.push(rel);
}
if (badAuthMigrationOrder.length) note(failures, `Auth routes establish a session before guest-data migration: ${badAuthMigrationOrder.join(', ')}`);
else note(passes, 'Email signup/login and Google auth migrate guest-owned work before establishing the authenticated session.');

// Core ownership/target invariants must also exist at the database boundary.
const domainIntegrityMigration = path.join(root, 'drizzle/0009_domain_integrity_checks.sql');
if (fs.existsSync(domainIntegrityMigration) && fs.existsSync(schemaSource) && fs.existsSync(baselineSql)) {
  const dbSchemaSource = fs.readFileSync(schemaSource, 'utf8');
  const baseSql = fs.readFileSync(baselineSql, 'utf8');
  const migrationSql = fs.readFileSync(domainIntegrityMigration, 'utf8');
  const required = [
    'reviews_exactly_one_target_check',
    'reviews_rating_range_check',
    'trips_exactly_one_owner_check',
    'bookings_owner_exclusive_check',
    'ai_conversations_exactly_one_owner_check',
  ];
  const missing = required.filter((name) => !dbSchemaSource.includes(name) || !baseSql.includes(name) || !migrationSql.includes(`VALIDATE CONSTRAINT ${name}`));
  if (missing.length) note(failures, `Database domain integrity checks are incomplete: ${missing.join(', ')}`);
  else note(passes, 'Database enforces review target/rating and guest-vs-user ownership invariants.');
}


// Conversational trip adjustments must never mutate booking-linked itinerary
// fields, and multi-item cost edits must be atomic at the application layer.
const tripAdjustRoute = path.join(root, 'src/app/api/trips/[id]/adjust/route.ts');
if (fs.existsSync(tripAdjustRoute)) {
  const source = fs.readFileSync(tripAdjustRoute, 'utf8');
  const protectsBooked = source.includes('isNull(itineraryItems.bookingId)')
    && source.includes('await db.transaction(async (tx) =>')
    && source.includes('.where(and(eq(itineraryItems.id, item.id), isNull(itineraryItems.bookingId)))');
  if (!protectsBooked) {
    note(failures, 'Trip conversational cost adjustment can mutate booking-linked itinerary items or apply partial multi-item edits.');
  } else {
    note(passes, 'Trip conversational cost adjustment is transactional and excludes booking-linked itinerary items at write time.');
  }
}

// Free bookings are confirmed without a payment webhook, so the itinerary
// mutation must still prove that the item is linked to this exact booking.
const providerBookingActionRoute = path.join(root, 'src/app/api/provider-bookings/[id]/route.ts');
if (fs.existsSync(providerBookingActionRoute)) {
  const source = fs.readFileSync(providerBookingActionRoute, 'utf8');
  const guardedConfirmation = source.includes('eq(itineraryItems.bookingId, updated.id)')
    && source.includes('status: "booked"')
    && source.includes('.returning({ id: itineraryItems.id })')
    && source.includes('throw new BookingItineraryLinkageError()')
    && source.includes('error instanceof BookingItineraryLinkageError');
  if (!guardedConfirmation) {
    note(failures, 'Zero-price provider booking confirmation can commit without proving the exact itinerary↔booking linkage.');
  } else {
    note(passes, 'Zero-price provider booking confirmation rolls back unless the exact linked itinerary item is updated.');
  }
}

const tripMutationRoute = path.join(root, 'src/app/api/trips/[id]/route.ts');
if (fs.existsSync(tripMutationRoute)) {
  const source = fs.readFileSync(tripMutationRoute, 'utf8');
  const destinationProtected = source.includes('parsed.data.destinationCity !== trip.destinationCity')
    && source.includes('parsed.data.destinationCountry !== trip.destinationCountry')
    && source.includes('dedicated replan flow')
    && source.includes('destinationCity: _destinationCity')
    && source.includes('destinationCountry: _destinationCountry');
  const lifecycleProtected = source.includes('parsed.data.status !== trip.status')
    && source.includes('dedicated lifecycle action')
    && source.includes('status: _status');
  const deleteProtectsBookings = source.includes('for update of ii')
    && source.includes('inArray(bookings.status, ["draft", "pending", "awaiting_payment", "confirmed"])')
    && source.includes('throw new ActiveTripBookingError()');
  if (!destinationProtected) {
    note(failures, 'Trip PATCH can change destination independently of its existing itinerary.');
  } else {
    note(passes, 'Trip destination changes fail closed until a dedicated itinerary replan flow exists.');
  }
  if (!lifecycleProtected || !deleteProtectsBookings) {
    note(failures, 'Generic trip lifecycle/delete mutations can bypass active-booking consistency rules.');
  } else {
    note(passes, 'Trip status changes require a dedicated lifecycle flow and deletion serializes against active itinerary bookings.');
  }
}

const aiToolsSource = path.join(root, 'src/lib/ai/tools.ts');
const aiToolInputSource = path.join(root, 'src/lib/ai/tool-input.ts');
if (fs.existsSync(aiToolsSource) && fs.existsSync(aiToolInputSource)) {
  const source = fs.readFileSync(aiToolsSource, 'utf8');
  const inputSource = fs.readFileSync(aiToolInputSource, 'utf8');
  const bounded = source.includes('normalizeAiToolText(args.city, 120, true)')
    && source.includes('normalizeAiToolText(args.country, 120)')
    && source.includes('normalizeAiToolText(args.keyword, 200)');
  const literalLike = source.includes('escapeLikePattern(cityInput.value!)')
    && source.includes('escapeLikePattern(countryInput.value)')
    && source.includes('escapeLikePattern(keywordInput.value)')
    && inputSource.includes('export function escapeLikePattern')
    && inputSource.includes('return value.replace(');
  if (!bounded || !literalLike) {
    note(failures, 'Sindbad AI database tool arguments are not consistently length-bounded and LIKE-wildcard escaped.');
  } else {
    note(passes, 'Sindbad AI database tool arguments are bounded and model-supplied LIKE wildcards are treated literally.');
  }
}

// 10. No Git remote in this local-only phase
try {
  const remotes = execFileSync('git', ['remote'], { cwd: root, encoding: 'utf8', timeout: 5000 }).trim();
  if (remotes) note(failures, `Local-only contract violated: Git remotes configured: ${remotes}`); else note(passes, 'No Git remote configured.');
} catch (e) { note(warnings, `Could not inspect Git remotes: ${e.message}`); }

console.log('=== My Sindbad static QA ===');
for (const p of passes) console.log(`PASS  ${p}`);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`Summary: ${passes.length} pass, ${warnings.length} warn, ${failures.length} fail`);
process.exitCode = failures.length ? 1 : 0;
