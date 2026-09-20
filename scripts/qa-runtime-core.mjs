#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { scryptSync } from 'node:crypto';

const root = process.cwd();
const req = createRequire(import.meta.url);
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 5000 }).trim();
const ts = req(path.join(globalRoot, 'typescript/lib/typescript.js'));
const cache = new Map();

function resolveLocal(fromFile, spec) {
  const base = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve ${spec} from ${fromFile}`);
}

function loadTs(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const source = fs.readFileSync(file, 'utf8').replace(/^import\s+["']server-only["'];?\s*$/m, '');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  cache.set(file, module);
  function localRequire(spec) {
    if (spec.startsWith('.') || spec.startsWith('@/')) return loadTs(resolveLocal(file, spec));
    return req(spec);
  }
  new Function('require', 'module', 'exports', '__filename', '__dirname', js)(localRequire, module, module.exports, file, path.dirname(file));
  return module.exports;
}

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const equal = (actual, expected, message) => check(Object.is(actual, expected), `${message}: expected=${expected} actual=${actual}`);

const password = loadTs(path.join(root, 'src/lib/auth/password.ts'));
const current = password.hashPassword('Correct Horse Battery Staple');
check(current.startsWith('scrypt2:32768:8:3:'), 'password current format/work factor');
equal(password.verifyPassword('Correct Horse Battery Staple', current), true, 'password correct verification');
equal(password.verifyPassword('wrong', current), false, 'password wrong verification');
equal(password.passwordHashNeedsUpgrade(current), false, 'current hash upgrade detection');
const legacySalt = '11'.repeat(16);
const legacy = `scrypt:${legacySalt}:${scryptSync('legacy-password', legacySalt, 64).toString('hex')}`;
equal(password.verifyPassword('legacy-password', legacy), true, 'legacy hash compatibility');
equal(password.passwordHashNeedsUpgrade(legacy), true, 'legacy hash marked for upgrade');
check(!password.verifyPassword('anything', `scrypt2:1073741824:8:1:${'00'.repeat(16)}:${'00'.repeat(64)}`), 'abusive scrypt parameters fail closed');
let timingWorkOk = true; try { password.consumePasswordVerificationWork('unknown-account-password'); } catch { timingWorkOk = false; }
check(timingWorkOk, 'timing-floor password derivation executes');

const guestId = loadTs(path.join(root, 'src/lib/auth/guest-id.ts'));
equal(guestId.isValidGuestId('guest_550e8400-e29b-41d4-a716-446655440000'), true, 'valid guest id');
equal(guestId.isValidGuestId('guest_not-a-uuid'), false, 'invalid guest id');

const requestClient = loadTs(path.join(root, 'src/lib/request-client.ts'));
equal(requestClient.clientIpFromRequest(new Request('https://example.test', { headers: { 'x-forwarded-for': '203.0.113.4, 10.0.0.2' } })), '203.0.113.4', 'forwarded client IP normalization');
equal(requestClient.clientIpFromRequest(new Request('https://example.test', { headers: { 'x-forwarded-for': 'not-an-ip' } })), null, 'malformed client IP rejected');

const appOrigin = loadTs(path.join(root, 'src/lib/app-origin.ts'));
const originalNodeEnv = process.env.NODE_ENV;
const originalAppBaseUrl = process.env.APP_BASE_URL;
const originalAuthBaseUrl = process.env.AUTH_BASE_URL;
try {
  process.env.NODE_ENV = 'production';
  delete process.env.APP_BASE_URL;
  delete process.env.AUTH_BASE_URL;
  equal(appOrigin.getTrustedAppOrigin('https://attacker.example'), null, 'production does not trust request Host origin');
  process.env.APP_BASE_URL = 'http://insecure.example';
  equal(appOrigin.getTrustedAppOrigin('https://attacker.example'), null, 'production rejects non-HTTPS configured origin');
  process.env.APP_BASE_URL = 'https://travel.example/path/ignored';
  equal(appOrigin.getTrustedAppOrigin('https://attacker.example'), 'https://travel.example', 'production uses canonical configured HTTPS origin');
  delete process.env.APP_BASE_URL;
  process.env.AUTH_BASE_URL = 'https://legacy.example';
  equal(appOrigin.getTrustedAppOrigin('https://attacker.example'), 'https://legacy.example', 'legacy auth base remains compatible');
  process.env.NODE_ENV = 'development';
  delete process.env.AUTH_BASE_URL;
  equal(appOrigin.getTrustedAppOrigin('http://localhost:3000'), 'http://localhost:3000', 'development may use local request origin');
} finally {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  if (originalAppBaseUrl === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = originalAppBaseUrl;
  if (originalAuthBaseUrl === undefined) delete process.env.AUTH_BASE_URL; else process.env.AUTH_BASE_URL = originalAuthBaseUrl;
}

const mutationOrigin = loadTs(path.join(root, 'src/lib/security/mutation-origin.ts'));
const savedMutationNodeEnv = process.env.NODE_ENV;
const savedMutationAppBaseUrl = process.env.APP_BASE_URL;
const savedMutationAuthBaseUrl = process.env.AUTH_BASE_URL;
try {
  process.env.NODE_ENV = 'production';
  process.env.APP_BASE_URL = 'https://travel.example';
  delete process.env.AUTH_BASE_URL;
  equal(
    mutationOrigin.isTrustedMutationRequest(new Request('https://travel.example/api/trips', { method: 'POST', headers: { origin: 'https://travel.example', 'sec-fetch-site': 'same-origin' } })),
    true,
    'mutation origin accepts exact canonical same origin',
  );
  equal(
    mutationOrigin.isTrustedMutationRequest(new Request('https://travel.example/api/trips', { method: 'POST', headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } })),
    false,
    'mutation origin rejects cross-site browser request',
  );
  equal(
    mutationOrigin.isTrustedMutationRequest(new Request('https://travel.example/api/trips', { method: 'POST', headers: { origin: 'https://evil.travel.example', 'sec-fetch-site': 'same-site' } })),
    false,
    'mutation origin rejects sibling-subdomain same-site request',
  );
  equal(
    mutationOrigin.isTrustedMutationRequest(new Request('https://travel.example/api/trips', { method: 'POST', headers: { 'sec-fetch-site': 'same-site' } })),
    false,
    'mutation origin rejects same-site browser mutation when exact Origin proof is missing',
  );
  equal(
    mutationOrigin.isTrustedMutationRequest(new Request('https://travel.example/api/trips', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } })),
    true,
    'mutation origin permits same-origin fetch metadata when Origin is omitted',
  );
  equal(
    mutationOrigin.isTrustedMutationRequest(new Request('https://travel.example/api/trips', { method: 'POST' })),
    true,
    'mutation origin permits non-browser/native request without browser CSRF headers',
  );
  delete process.env.APP_BASE_URL;
  equal(
    mutationOrigin.isTrustedMutationRequest(new Request('https://travel.example/api/trips', { method: 'POST', headers: { origin: 'https://travel.example' } })),
    false,
    'production mutation with Origin fails closed when canonical app origin is not configured',
  );
} finally {
  if (savedMutationNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedMutationNodeEnv;
  if (savedMutationAppBaseUrl === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = savedMutationAppBaseUrl;
  if (savedMutationAuthBaseUrl === undefined) delete process.env.AUTH_BASE_URL; else process.env.AUTH_BASE_URL = savedMutationAuthBaseUrl;
}

const returnPath = loadTs(path.join(root, 'src/lib/auth/return-path.ts'));
equal(returnPath.sanitizeReturnPath('/ar/bookings/123?x=1#top', '/ar'), '/ar/bookings/123?x=1#top', 'safe return path');
equal(returnPath.sanitizeReturnPath('//evil.example', '/ar'), '/ar', 'protocol-relative redirect blocked');
equal(returnPath.sanitizeReturnPath('https://evil.example', '/ar'), '/ar', 'absolute redirect blocked');
equal(returnPath.sanitizeReturnPath('/\\evil.example', '/ar'), '/ar', 'backslash redirect blocked');

const aiToolInput = loadTs(path.join(root, 'src/lib/ai/tool-input.ts'));
const aiCity = aiToolInput.normalizeAiToolText('  Marrakech  ', 120, true);
check(aiCity.ok && aiCity.value === 'Marrakech', 'AI tool text trims bounded required city');
const aiMissingCity = aiToolInput.normalizeAiToolText('   ', 120, true);
check(!aiMissingCity.ok && aiMissingCity.reason === 'required', 'AI tool text rejects blank required city');
const aiLongKeyword = aiToolInput.normalizeAiToolText('x'.repeat(201), 200);
check(!aiLongKeyword.ok && aiLongKeyword.reason === 'too_long', 'AI tool text rejects oversized keyword');
const aiControlText = aiToolInput.normalizeAiToolText('Paris\u0000France', 120);
check(!aiControlText.ok && aiControlText.reason === 'invalid', 'AI tool text rejects control characters');
equal(aiToolInput.escapeLikePattern('100%_\\'), '100\\%\\_\\\\', 'AI tool LIKE wildcard escaping');

const date = loadTs(path.join(root, 'src/lib/domain/date.ts'));
equal(date.isValidIsoDate('2026-02-28'), true, 'valid ISO date');
equal(date.isValidIsoDate('2026-02-31'), false, 'impossible ISO date blocked');
equal(date.isoDateDifferenceDays('2026-09-20', '2026-09-23'), 3, 'date difference');

const clockTime = loadTs(path.join(root, 'src/lib/domain/time.ts'));
equal(clockTime.isValidClockTime('00:00'), true, 'midnight clock time');
equal(clockTime.isValidClockTime('23:59'), true, 'latest valid clock time');
equal(clockTime.isValidClockTime('24:00'), false, '24:00 rejected');
equal(clockTime.isValidClockTime('12:60'), false, 'invalid minute rejected');

const timeZoneValue = loadTs(path.join(root, 'src/lib/timezone-value.ts'));
equal(timeZoneValue.normalizeTimeZoneCookie('Africa%2FCasablanca'), 'Africa/Casablanca', 'valid encoded timezone cookie');
equal(timeZoneValue.normalizeTimeZoneCookie('%'), undefined, 'malformed timezone cookie fails closed');
equal(timeZoneValue.normalizeTimeZoneCookie('Not%2FA_Real_Zone'), undefined, 'unknown timezone cookie rejected');

const paymentConfig = loadTs(path.join(root, 'src/lib/payments/provider.ts'));
const savedPaymentEnv = {
  nodeEnv: process.env.NODE_ENV,
  stripeSecret: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  demo: process.env.PAYMENTS_DEMO_MODE,
};
try {
  process.env.NODE_ENV = 'production';
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  delete process.env.STRIPE_WEBHOOK_SECRET;
  process.env.PAYMENTS_DEMO_MODE = 'false';
  equal(paymentConfig.isPaymentsConfigured(), false, 'Stripe secret without webhook secret fails closed');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder';
  equal(paymentConfig.isPaymentsConfigured(), true, 'Stripe secret plus webhook secret enables payment configuration');
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  process.env.PAYMENTS_DEMO_MODE = 'true';
  equal(paymentConfig.isPaymentsConfigured(), false, 'demo payment mode stays disabled in production');
  process.env.NODE_ENV = 'development';
  equal(paymentConfig.isPaymentsConfigured(), true, 'demo payment mode is available only for local development QA');
} finally {
  if (savedPaymentEnv.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedPaymentEnv.nodeEnv;
  if (savedPaymentEnv.stripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = savedPaymentEnv.stripeSecret;
  if (savedPaymentEnv.stripeWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = savedPaymentEnv.stripeWebhookSecret;
  if (savedPaymentEnv.demo === undefined) delete process.env.PAYMENTS_DEMO_MODE; else process.env.PAYMENTS_DEMO_MODE = savedPaymentEnv.demo;
}

const pricing = loadTs(path.join(root, 'src/lib/domain/booking-pricing.ts'));
equal(pricing.calculateBookingTotal({ category: 'transfer', unitPrice: 120, guestsCount: 4 }), 120, 'flat transfer pricing');
equal(pricing.calculateBookingTotal({ category: 'activity', unitPrice: 25, guestsCount: 3 }), 75, 'per-person activity pricing');
equal(pricing.calculateBookingTotal({ category: 'hotel', unitPrice: 100, guestsCount: 2, startDate: '2026-09-20', endDate: '2026-09-23' }), 300, 'hotel-night pricing');
equal(pricing.isSupportedBookingTotal(99_999_999.99), true, 'booking total accepts numeric(10,2) maximum');
equal(pricing.isSupportedBookingTotal(100_000_000), false, 'booking total rejects numeric(10,2) overflow');
equal(pricing.isSupportedBookingTotal(pricing.calculateBookingTotal({ category: 'hotel', unitPrice: 1_000_000, guestsCount: 1, startDate: '2026-01-01', endDate: '2026-12-31' })), false, 'extreme hotel duration/price cannot overflow booking storage');
check(/invalid/i.test(pricing.validateBookingDates('hotel', '2026-02-31', '2026-03-02') ?? ''), 'invalid booking date rejected');

const bookingState = loadTs(path.join(root, 'src/lib/domain/booking-state-machine.ts'));
equal(bookingState.canTransition('cancelled', 'confirmed'), false, 'cancelled booking cannot resurrect');
equal(bookingState.canTransition('awaiting_payment', 'confirmed'), true, 'payment confirmation transition');

const paymentState = loadTs(path.join(root, 'src/lib/domain/payment-state-machine.ts'));
equal(paymentState.resolvePaymentStatus('succeeded', 'failed'), 'succeeded', 'stale payment failure cannot downgrade success');
equal(paymentState.resolvePaymentStatus('refunded', 'succeeded'), 'refunded', 'refunded payment cannot move backward');
check(!paymentState.mutablePaymentStatusesForIncoming('failed').includes('succeeded'), 'atomic failed webhook guard excludes succeeded');
check(!paymentState.mutablePaymentStatusesForIncoming('processing').includes('succeeded'), 'atomic processing webhook guard excludes succeeded');
check(paymentState.mutablePaymentStatusesForIncoming('succeeded').includes('failed'), 'delayed success may atomically upgrade failed');

const currency = loadTs(path.join(root, 'src/lib/payments/currency.ts'));
equal(currency.toStripeMinorUnits(10.99, 'USD'), 1099, 'USD minor units');
equal(currency.toStripeMinorUnits(500, 'JPY'), 500, 'JPY zero-decimal units');
let fractionalJpyRejected = false;
try { currency.toStripeMinorUnits(500.5, 'JPY'); } catch { fractionalJpyRejected = true; }
check(fractionalJpyRejected, 'fractional JPY rejected');

const providerBookingView = loadTs(path.join(root, 'src/lib/bookings/provider-view.ts'));
const providerView = providerBookingView.toProviderBookingView({
  id: 'booking-1', userId: 'internal-user', guestId: 'internal-guest', providerId: 'provider-1', serviceId: 'service-1',
  itineraryItemId: 'internal-item', category: 'activity', status: 'pending', startDate: '2026-10-01', endDate: null,
  guestsCount: 2, totalAmount: '50.00', currency: 'USD', idempotencyKey: 'internal-idempotency', contactName: 'Guest',
  contactEmail: 'guest@example.test', contactPhone: '+10000000000', notes: 'Window seat', cancelledReason: null,
  createdAt: new Date('2026-09-19T00:00:00Z'), updatedAt: new Date('2026-09-19T00:00:00Z'),
});
for (const forbidden of ['userId', 'guestId', 'providerId', 'serviceId', 'itineraryItemId', 'idempotencyKey']) {
  check(!(forbidden in providerView), `provider booking view omits ${forbidden}`);
}
equal(providerView.id, 'booking-1', 'provider booking view keeps operational booking id');
equal(providerView.contactEmail, 'guest@example.test', 'provider booking view keeps fulfilment contact');

const userBookingView = loadTs(path.join(root, 'src/lib/bookings/user-view.ts'));
const userView = userBookingView.toUserBookingView({
  id: 'booking-2', userId: 'internal-user', guestId: 'internal-guest', providerId: 'provider-2', serviceId: 'service-2',
  itineraryItemId: 'item-2', category: 'hotel', status: 'awaiting_payment', startDate: '2026-10-01', endDate: '2026-10-03',
  guestsCount: 2, totalAmount: '200.00', currency: 'USD', idempotencyKey: 'internal-idempotency-2', contactName: 'Traveler',
  contactEmail: 'traveler@example.test', contactPhone: null, notes: null, cancelledReason: null,
  createdAt: new Date('2026-09-19T00:00:00Z'), updatedAt: new Date('2026-09-19T00:00:00Z'),
});
for (const forbidden of ['userId', 'guestId', 'idempotencyKey']) {
  check(!(forbidden in userView), `traveler booking view omits ${forbidden}`);
}
equal(userView.providerId, 'provider-2', 'traveler booking view keeps provider reference');
equal(userView.itineraryItemId, 'item-2', 'traveler booking view keeps itinerary reference');

const clientPaymentView = loadTs(path.join(root, 'src/lib/payments/client-view.ts'));
const paymentView = clientPaymentView.toClientPaymentView({
  id: 'payment-1', bookingId: 'booking-2', provider: 'stripe', providerRef: 'cs_internal', status: 'processing',
  amount: '200.00', currency: 'USD', isTestMode: true, idempotencyKey: 'internal-payment-key', rawPayload: { secret: 'internal' },
  createdAt: new Date('2026-09-19T00:00:00Z'), updatedAt: new Date('2026-09-19T00:00:00Z'),
});
for (const forbidden of ['providerRef', 'idempotencyKey', 'rawPayload']) {
  check(!(forbidden in paymentView), `client payment view omits ${forbidden}`);
}
equal(paymentView.provider, 'stripe', 'client payment view keeps provider identity');
equal(paymentView.status, 'processing', 'client payment view keeps status');

const clientTripView = loadTs(path.join(root, 'src/lib/trips/client-view.ts'));
const tripView = clientTripView.toClientTripView({
  id: 'trip-1', userId: 'internal-user', guestId: 'guest_550e8400-e29b-41d4-a716-446655440000', title: 'Marrakech',
  destinationCity: 'Marrakech', destinationCountry: 'Morocco', startDate: '2026-10-01', endDate: '2026-10-03',
  travelers: 2, budgetAmount: '500.00', budgetCurrency: 'USD', travelStyle: 'culture', interests: ['food'], notes: null,
  generatedBy: 'ai', status: 'planned', createdAt: new Date('2026-09-19T00:00:00Z'), updatedAt: new Date('2026-09-19T00:00:00Z'),
});
for (const forbidden of ['userId', 'guestId']) check(!(forbidden in tripView), `client trip view omits ${forbidden}`);
equal(tripView.id, 'trip-1', 'client trip view keeps trip id');

const aiClientView = loadTs(path.join(root, 'src/lib/ai/client-view.ts'));
const conversationView = aiClientView.toClientConversationView({
  id: 'conversation-1', userId: null, guestId: 'guest_550e8400-e29b-41d4-a716-446655440000', title: 'Trip ideas', context: { tripId: 'trip-1' },
  createdAt: new Date('2026-09-19T00:00:00Z'), updatedAt: new Date('2026-09-19T00:00:00Z'),
});
for (const forbidden of ['userId', 'guestId']) check(!(forbidden in conversationView), `client AI conversation view omits ${forbidden}`);
const messageView = aiClientView.toClientMessageView({
  id: 'message-1', conversationId: 'conversation-1', role: 'assistant', content: 'Hello', toolCalls: [{ internal: true }],
  createdAt: new Date('2026-09-19T00:00:00Z'),
});
for (const forbidden of ['conversationId', 'toolCalls']) check(!(forbidden in messageView), `client AI message view omits ${forbidden}`);
equal(messageView.content, 'Hello', 'client AI message view keeps content');

const communityClientView = loadTs(path.join(root, 'src/lib/community/client-view.ts'));
const publicContributionView = communityClientView.toPublicContributionView({
  id: 'contribution-1', type: 'new_place', placeId: null, payload: { name: 'Hidden gem' }, status: 'pending',
  confirmationsCount: 2, source: 'community', submittedByUserId: 'internal-user', reviewNote: 'internal moderation',
  reviewedAt: new Date('2026-09-19T00:00:00Z'), createdAt: new Date('2026-09-18T00:00:00Z'),
});
for (const forbidden of ['submittedByUserId', 'reviewNote', 'reviewedAt']) {
  check(!(forbidden in publicContributionView), `public contribution view omits ${forbidden}`);
}
const ownerContributionView = communityClientView.toOwnerContributionView({
  id: 'contribution-2', type: 'new_place', placeId: null, payload: { name: 'Own place' }, status: 'rejected',
  confirmationsCount: 0, source: 'community', submittedByUserId: 'internal-user', reviewNote: 'Needs evidence',
  reviewedAt: new Date('2026-09-19T00:00:00Z'), createdAt: new Date('2026-09-18T00:00:00Z'),
});
check(!('submittedByUserId' in ownerContributionView), 'owner contribution view omits submittedByUserId');
equal(ownerContributionView.reviewNote, 'Needs evidence', 'owner contribution view keeps moderation feedback');

const trust = loadTs(path.join(root, 'src/lib/domain/community-trust.ts'));
equal(trust.evaluateContributionStatus({ confirmationsCount: 100, reportsCount: 0, currentStatus: 'pending' }), 'pending', 'votes alone never auto-approve');
equal(trust.evaluateContributionStatus({ confirmationsCount: 10, reportsCount: 1, currentStatus: 'pending' }), 'flagged', 'reported pending contribution flags');

const contributionFlow = loadTs(path.join(root, 'src/lib/domain/community-contributions.ts'));
equal(contributionFlow.isImplementedContributionType('new_place'), true, 'new-place contribution workflow implemented');
equal(contributionFlow.isImplementedContributionType('place_correction'), false, 'unimplemented place-correction workflow fails closed');
equal(contributionFlow.isImplementedContributionType('photo'), false, 'unimplemented contribution photo workflow fails closed');

const storage = loadTs(path.join(root, 'src/lib/storage/index.ts'));
equal(storage.isUploadStorageConfigured({ NODE_ENV: 'development' }), true, 'local upload storage available in development');
equal(storage.isUploadStorageConfigured({ NODE_ENV: 'production' }), false, 'production upload storage fails closed until durable storage is configured');
const previousStorageEnv = process.env.NODE_ENV;
try {
  process.env.NODE_ENV = 'production';
  let productionStorageRejected = false;
  try {
    await storage.saveUpload(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png', 'avatar', '550e8400-e29b-41d4-a716-446655440000');
  } catch (error) {
    productionStorageRejected = error?.name === 'UploadStorageUnavailableError';
  }
  check(productionStorageRejected, 'production local upload write is rejected before filesystem persistence');
} finally {
  if (previousStorageEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousStorageEnv;
}

const boundedBody = loadTs(path.join(root, 'src/lib/http/bounded-body.ts'));
const boundedSmall = await boundedBody.readRequestBodyWithLimit(new Request('https://example.test/upload', { method: 'POST', body: '12345' }), 5);
equal(new TextDecoder().decode(boundedSmall), '12345', 'bounded request body accepts exact limit');
let streamedBodyRejected = false;
try {
  await boundedBody.readRequestBodyWithLimit(new Request('https://example.test/upload', { method: 'POST', body: '123456' }), 5);
} catch (error) {
  streamedBodyRejected = error?.name === 'RequestBodyTooLargeError';
}
check(streamedBodyRejected, 'bounded request body rejects streamed data over the limit');
let declaredBodyRejected = false;
try {
  await boundedBody.readRequestBodyWithLimit(new Request('https://example.test/upload', { method: 'POST', headers: { 'content-length': '999' }, body: 'x' }), 5);
} catch (error) {
  declaredBodyRejected = error?.name === 'RequestBodyTooLargeError';
}
check(declaredBodyRejected, 'bounded request body rejects oversized declared content length before parsing');

const exactJson = await boundedBody.parseJsonBodyWithLimit(
  new Request('https://example.test/json', { method: 'POST', body: '12345' }),
  5,
);
check(exactJson.ok, 'bounded JSON parser accepts a body at the exact byte limit');
if (exactJson.ok) equal(exactJson.body, 12345, 'bounded JSON parser preserves valid JSON values');

const malformedJson = await boundedBody.parseJsonBodyWithLimit(
  new Request('https://example.test/json', { method: 'POST', body: '{bad' }),
  16,
);
check(malformedJson.ok && malformedJson.body === null, 'bounded JSON parser preserves malformed JSON as the normal validation-null path');

const declaredJsonTooLarge = await boundedBody.parseJsonBodyWithLimit(
  new Request('https://example.test/json', { method: 'POST', headers: { 'content-length': '999' }, body: '{}' }),
  32,
);
check(!declaredJsonTooLarge.ok && declaredJsonTooLarge.reason === 'too_large', 'bounded JSON parser rejects oversized declared content length before JSON parsing');

const streamedJsonBody = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('{\"message\":\"'));
    controller.enqueue(new TextEncoder().encode('x'.repeat(64)));
    controller.enqueue(new TextEncoder().encode('\"}'));
    controller.close();
  },
});
const streamedJsonTooLarge = await boundedBody.parseJsonBodyWithLimit(
  new Request('https://example.test/json', { method: 'POST', body: streamedJsonBody, duplex: 'half' }),
  32,
);
check(!streamedJsonTooLarge.ok && streamedJsonTooLarge.reason === 'too_large', 'bounded JSON parser rejects chunked/unknown-length oversized bodies while streaming');

const exactResponse = new Response('12345');
const exactResponseBytes = await boundedBody.readResponseBodyWithLimit(exactResponse, 5);
equal(new TextDecoder().decode(exactResponseBytes), '12345', 'bounded response body accepts exact limit');

let declaredResponseRejected = false;
try {
  await boundedBody.readResponseBodyWithLimit(
    new Response('x', { headers: { 'content-length': '999' } }),
    5,
  );
} catch (error) {
  declaredResponseRejected = error?.name === 'ResponseBodyTooLargeError';
}
check(declaredResponseRejected, 'bounded response body rejects oversized declared content length before parsing');

const streamedResponseBody = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('123'));
    controller.enqueue(new TextEncoder().encode('456'));
    controller.close();
  },
});
let streamedResponseRejected = false;
try {
  await boundedBody.readResponseBodyWithLimit(new Response(streamedResponseBody), 5);
} catch (error) {
  streamedResponseRejected = error?.name === 'ResponseBodyTooLargeError';
}
check(streamedResponseRejected, 'bounded response body rejects chunked/unknown-length oversized responses while streaming');

const boundedResponseJson = await boundedBody.parseJsonResponseWithLimit(
  new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }),
  64,
);
equal(boundedResponseJson.ok, true, 'bounded response JSON parser preserves valid JSON');

const multipart = new FormData();
multipart.set('ownerType', 'avatar');
multipart.set('file', new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' }));
const parsedMultipart = await boundedBody.parseMultipartFormDataWithLimit(new Request('https://example.test/upload', { method: 'POST', body: multipart }), 1024);
equal(parsedMultipart.get('ownerType'), 'avatar', 'bounded multipart parser preserves fields');
check(parsedMultipart.get('file') instanceof File, 'bounded multipart parser preserves files');

const mapTypes = loadTs(path.join(root, 'src/lib/maps/types.ts'));
const devMapConfig = mapTypes.resolveRasterTileConfig({ NODE_ENV: 'development' });
check(devMapConfig?.tileUrl?.includes('tile.openstreetmap.org'), 'development map config keeps local-QA OSM fallback');
equal(mapTypes.resolveRasterTileConfig({ NODE_ENV: 'production' }), null, 'production map config fails closed without explicit provider');
const prodMapConfig = mapTypes.resolveRasterTileConfig({
  NODE_ENV: 'production',
  NEXT_PUBLIC_MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png',
  NEXT_PUBLIC_MAP_ATTRIBUTION: 'Example Maps',
});
equal(prodMapConfig?.tileUrl, 'https://tiles.example.test/{z}/{x}/{y}.png', 'production map config accepts explicit HTTPS provider');
equal(mapTypes.resolveRasterTileConfig({ NODE_ENV: 'production', NEXT_PUBLIC_MAP_TILE_URL: 'http://tiles.example.test/{z}/{x}/{y}.png', NEXT_PUBLIC_MAP_ATTRIBUTION: 'Bad' }), null, 'production map config rejects insecure HTTP provider');
equal(mapTypes.resolveRasterTileConfig({ NODE_ENV: 'production', NEXT_PUBLIC_MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png' }), null, 'production map config requires attribution');
equal(mapTypes.resolveRasterTileConfig({ NODE_ENV: 'development', NEXT_PUBLIC_MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png' }), null, 'partial development map config fails closed instead of silently falling back');
equal(mapTypes.resolveRasterTileConfig({ NODE_ENV: 'production', NEXT_PUBLIC_MAP_TILE_URL: 'https://tiles.example.test/static.png', NEXT_PUBLIC_MAP_ATTRIBUTION: 'Bad' }), null, 'production map config requires z/x/y URL template placeholders');

const coordinates = loadTs(path.join(root, 'src/lib/domain/coordinates.ts'));
equal(coordinates.hasCompleteCoordinatePair(undefined, undefined), true, 'optional coordinate pair may be absent');
equal(coordinates.hasCompleteCoordinatePair(null, null), true, 'nullable coordinate pair may be absent');
equal(coordinates.hasCompleteCoordinatePair(31.6, -7.9), true, 'complete coordinate pair accepted');
equal(coordinates.hasCompleteCoordinatePair(31.6, undefined), false, 'latitude without longitude rejected');
equal(coordinates.hasCompleteCoordinatePair(undefined, -7.9), false, 'longitude without latitude rejected');

const geo = loadTs(path.join(root, 'src/lib/geo/distance.ts'));
const km = geo.haversineKm({ lat: 31.6295, lng: -7.9811 }, { lat: 33.5731, lng: -7.5898 });
check(km > 200 && km < 260, 'geo distance realistic');
const marrakechBox = geo.boundingBoxForRadius({ lat: 31.6295, lng: -7.9811 }, 75);
check(marrakechBox.minLat < 31.6295 && marrakechBox.maxLat > 31.6295, 'geo bounding box contains origin latitude');
check(!marrakechBox.crossesAntimeridian && marrakechBox.minLng < -7.9811 && marrakechBox.maxLng > -7.9811, 'ordinary geo bounding box contains origin longitude');
const datelineBox = geo.boundingBoxForRadius({ lat: 0, lng: 179.9 }, 75);
check(datelineBox.crossesAntimeridian && datelineBox.minLng > 0 && datelineBox.maxLng < 0, 'geo bounding box handles antimeridian crossing');
const polarBox = geo.boundingBoxForRadius({ lat: 89.9, lng: 10 }, 75);
equal(polarBox.minLng, -180, 'polar bounding box opens full longitude min');
equal(polarBox.maxLng, 180, 'polar bounding box opens full longitude max');

if (failures.length) {
  console.error('Core runtime QA FAILED');
  failures.forEach(f => console.error(`- ${f}`));
  process.exit(1);
}
console.log('Core runtime QA PASS: password/auth helpers, strict dates, booking pricing/state, payment state/currency, community trust, coordinate integrity and geo math verified without project dependencies.');
