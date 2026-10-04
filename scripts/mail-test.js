// npm test (part 2) — unit checks for the mailer with a simulated email provider (no real email is sent).
// Covers: retry once on temporary failures, never on 4xx, skip reasons. Extended by the Gmail safety checks.
const os = require('os');
const path = require('path');

Object.assign(process.env, {
  PAWPAL_DATA_FILE: path.join(os.tmpdir(), `pawpal-mail-test-${Date.now()}.json`), NODE_ENV: 'test', MONGODB_URI: '',
  GMAIL_CLIENT_ID: 'test-client.apps.googleusercontent.com', GMAIL_CLIENT_SECRET: 'test-secret', GMAIL_REFRESH_TOKEN: '1//test-refresh',
  ADMIN_EMAIL: 'owner@gmail.com', MAIL_RETRY_DELAY_MS: '20', RESEND_API_KEY: '', BREVO_API_KEY: '', SMTP_HOST: '',
});

let passed = 0;
const failures = [];
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); } else { failures.push(name); console.log(`  ❌ ${name} ${extra}`); }
};

// Simulated Google endpoints. `plan` is a queue of HTTP statuses for the next sends (default 200).
const sim = { plan: [], sends: [], tokenError: null };
global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('oauth2.googleapis.com/token')) {
    if (sim.tokenError) return { ok: false, status: 400, json: async () => ({ error: sim.tokenError, error_description: 'Token has been expired or revoked.' }) };
    return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.test', expires_in: 3599 }) };
  }
  if (url.includes('gmail.googleapis.com')) {
    const status = sim.plan.length ? sim.plan.shift() : 200;
    if (status === 'network') throw new TypeError('fetch failed');
    sim.sends.push(JSON.parse(opts.body).raw);
    return { ok: status < 400, status, text: async () => (status < 400 ? '{}' : `{"error":{"code":${status}}}`) };
  }
  throw new Error(`Unexpected request to ${url}`);
};

(async () => {
  const db = require('../src/db');
  await db.init();
  const mailer = require('../src/services/mailer');
  const send = (to, extra = {}) => mailer.sendMail({ to, subject: 'Hello', body: '<p>Hi</p>', type: 'test', ...extra });

  console.log('\nRetries');
  check('Gmail is the active provider', mailer.emailMode === 'gmail');
  sim.plan = [503]; sim.sends = [];
  let r = await send('first@gmail.com');
  check('A 5xx failure is retried once and then sent', r.status === 'sent' && r.retried === true && sim.sends.length === 2);
  sim.plan = ['network']; sim.sends = [];
  r = await send('second@gmail.com');
  check('A network error is retried once', r.status === 'sent' && r.retried === true);
  sim.plan = [503, 503]; sim.sends = [];
  r = await send('third@gmail.com');
  check('Two temporary failures in a row: recorded as failed, no third attempt', r.status === 'failed' && sim.sends.length === 2);
  sim.plan = [400]; sim.sends = [];
  r = await send('fourth@gmail.com');
  check('A 4xx failure is never retried', r.status === 'failed' && sim.sends.length === 1 && !r.retried);

  console.log('\nSkips');
  sim.sends = [];
  r = await send('jessica@example.com');
  check('Demo/test addresses are skipped without contacting the provider', r.status === 'skipped' && sim.sends.length === 0);
  r = await send('real@gmail.com', { skipReason: 'Not sent: turned off.' });
  check('A skip reason is recorded and nothing is sent', r.status === 'skipped' && r.error === 'Not sent: turned off.' && sim.sends.length === 0);

  await db.flush?.();
  console.log(failures.length ? `\n❌ ${passed} passed, ${failures.length} failed` : `\n✅ ${passed} passed, 0 failed`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
