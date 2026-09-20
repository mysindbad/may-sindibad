#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];
const passes = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const check = (condition, failure, pass) => {
  if (condition) passes.push(pass ?? failure);
  else failures.push(failure);
};

const google = read('src/app/api/auth/google/callback/route.ts');
check((google.match(/AbortSignal\.timeout\(GOOGLE_HTTP_TIMEOUT_MS\)/g) ?? []).length >= 2,
  'Google OAuth token/userinfo requests are not both bounded by a timeout.',
  'Google OAuth external HTTP calls have bounded timeouts.');

const ai = read('src/lib/ai/openai.ts');
check(/AbortSignal\.timeout\(30_000\)/.test(ai),
  'AI provider HTTP call has no bounded timeout.',
  'AI provider HTTP call has a bounded timeout.');

const weather = read('src/lib/weather/index.ts');
check(/AbortSignal\.timeout\(8000\)/.test(weather),
  'Weather provider HTTP call has no bounded timeout.',
  'Weather provider HTTP call has a bounded timeout.');

check(/MAX_AI_RESPONSE_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/.test(ai)
    && /parseJsonResponseWithLimit[\s\S]{0,500}MAX_AI_RESPONSE_BYTES/.test(ai)
    && /readResponseBodyWithLimit[\s\S]{0,500}MAX_AI_RESPONSE_BYTES/.test(ai)
    && !/response\.json\(/.test(ai)
    && !/response\.text\(/.test(ai),
  'AI provider response bodies are not consistently byte-bounded before parsing/error logging.',
  'AI provider success and error response bodies are bounded to 2 MiB before parsing/logging.');

check(/GOOGLE_RESPONSE_LIMIT_BYTES\s*=\s*256\s*\*\s*1024/.test(google)
    && (google.match(/parseJsonResponseWithLimit/g) ?? []).length >= 3
    && !/tokenResponse\.json\(/.test(google)
    && !/userInfoResponse\.json\(/.test(google),
  'Google OAuth token/userinfo response bodies are not both byte-bounded before JSON parsing.',
  'Google OAuth token and userinfo response bodies are bounded to 256 KiB before JSON parsing.');

check(/WEATHER_RESPONSE_LIMIT_BYTES\s*=\s*256\s*\*\s*1024/.test(weather)
    && /parseJsonResponseWithLimit[\s\S]{0,500}WEATHER_RESPONSE_LIMIT_BYTES/.test(weather)
    && !/res\.json\(/.test(weather),
  'Weather provider response body is not byte-bounded before JSON parsing.',
  'Weather provider response body is bounded to 256 KiB before JSON parsing.');

const stripe = read('src/lib/payments/stripe.ts');
check(/timeout:\s*20_000/.test(stripe) && /maxNetworkRetries:\s*2/.test(stripe),
  'Stripe client is missing bounded timeout/retry configuration.',
  'Stripe client has bounded timeout and SDK network retries.');
check(/idempotencyKey:\s*`mysindbad:\$\{input\.idempotencyKey\}`/.test(stripe),
  'Stripe create-session request is missing the app idempotency key.',
  'Stripe create-session request carries an idempotency key.');

const db = read('src/db/index.ts');
check(/connectionTimeoutMillis:\s*5_000/.test(db),
  'PostgreSQL pool connection establishment is unbounded.',
  'PostgreSQL pool connection establishment has a timeout.');
check(/pool\.on\(["']error["']/.test(db),
  'PostgreSQL pool has no idle-client error listener.',
  'PostgreSQL pool handles background idle-client errors.');

const sw = read('public/sw.js');
check(/event\.request\.method\s*!==\s*["']GET["']/.test(sw) && /url\.origin\s*!==\s*self\.location\.origin/.test(sw),
  'Service worker fetch policy does not clearly restrict itself to same-origin GET requests.',
  'Service worker fetch policy is restricted to same-origin GET requests.');
check(!/\/api\//.test(sw) && !/bookings|payments|auth/i.test((sw.match(/SHELL_ASSETS\s*=\s*\[[^\]]*\]/s) ?? [''])[0]),
  'Service worker shell cache appears to include dynamic/auth/payment API content.',
  'Service worker shell cache excludes API/auth/payment content.');

const manifest = JSON.parse(read('public/manifest.webmanifest'));
for (const expected of [192, 512]) {
  const icon = (manifest.icons ?? []).find((item) => item.sizes === `${expected}x${expected}` && item.type === 'image/png');
  if (!icon) {
    failures.push(`Manifest is missing ${expected}x${expected} PNG icon declaration.`);
    continue;
  }
  const file = path.join(root, 'public', icon.src.replace(/^\//, ''));
  if (!fs.existsSync(file)) {
    failures.push(`Manifest icon file is missing: ${icon.src}`);
    continue;
  }
  const buf = fs.readFileSync(file);
  const png = buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG';
  const width = png ? buf.readUInt32BE(16) : 0;
  const height = png ? buf.readUInt32BE(20) : 0;
  if (!png || width !== expected || height !== expected) failures.push(`Manifest icon ${icon.src} is not actually ${expected}x${expected} PNG.`);
  else passes.push(`Manifest ${expected}x${expected} icon dimensions match the declaration.`);
}

const nearby = read('src/components/home/NearbyDiscovery.tsx');
check(!/useEffect[\s\S]{0,500}geolocation/.test(nearby) && /onClick=\{handleEnableLocation\}/.test(nearby),
  'Geolocation may be requested without an explicit user action.',
  'Geolocation is requested only from the explicit enable-location action.');

if (manifest.lang === 'en' && manifest.dir === 'ltr') {
  warnings.push('Manifest install metadata is statically en/ltr while the app supports six locales; leave unchanged until locale-aware install metadata is intentionally designed.');
}

console.log('=== My Sindbad resilience/PWA static QA ===');
for (const p of passes) console.log(`PASS  ${p}`);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`Summary: ${passes.length} pass, ${warnings.length} warn, ${failures.length} fail`);
if (failures.length) process.exit(1);
