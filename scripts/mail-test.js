// npm test (part 2) — unit checks for the mailer with a simulated email provider (no real email is sent).
// Covers: retry once on temporary failures (never on 4xx), skip reasons, plain-text part and Reply-To,
// duplicate suppression, invalid domains, the daily limit and the expired-Gmail-sign-in banner.
const os = require('os');
const path = require('path');

Object.assign(process.env, {
  PAWPAL_DATA_FILE: path.join(os.tmpdir(), `pawpal-mail-test-${Date.now()}.json`), NODE_ENV: 'test', MONGODB_URI: '',
  GMAIL_CLIENT_ID: 'test-client.apps.googleusercontent.com', GMAIL_CLIENT_SECRET: 'test-secret', GMAIL_REFRESH_TOKEN: '1//test-refresh',
  ADMIN_EMAIL: 'owner@gmail.com', MAIL_FROM: 'PawPal <owner@gmail.com>', MAIL_RETRY_DELAY_MS: '20', MAIL_DAILY_LIMIT: '15', RESEND_API_KEY: '', BREVO_API_KEY: '', SMTP_HOST: '',
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

  console.log('\nMessage format');
  sim.sends = [];
  r = await mailer.sendMail({ to: 'format@gmail.com', subject: 'Café update — “Approved” 🎉', heading: 'Approved', body: '<p>Hi <b>Sam</b> &amp; family</p>',
    buttonText: 'View', buttonUrl: 'https://example.org/x', type: 'test' });
  const raw = Buffer.from(sim.sends[0] || '', 'base64url').toString('utf8');
  const parts = raw.split(/--pawpal-[^\r\n-]+/);
  const decode = (part) => Buffer.from((part.split('\r\n\r\n')[1] || '').replace(/\r\n/g, ''), 'base64').toString('utf8');
  const textPart = parts.find((x) => /text\/plain/.test(x)) || '';
  const htmlPart = parts.find((x) => /text\/html/.test(x)) || '';
  check('Every email is multipart/alternative with a plain-text part', /multipart\/alternative/.test(raw) && /Hi Sam & family/.test(decode(textPart)) && /View: https:\/\/example\.org\/x/.test(decode(textPart)));
  check('The HTML part keeps the branded layout', /<b>Sam<\/b>/.test(decode(htmlPart)));
  check('Reply-To is the MAIL_FROM address and there are no attachments', /\r\nReply-To: owner@gmail\.com\r\n/.test(raw) && !/Content-Disposition: attachment/i.test(raw));
  check('Non-ASCII subjects are encoded', /Subject: =\?UTF-8\?B\?/.test(raw));

  console.log('\nDuplicates and invalid addresses');
  sim.sends = [];
  const appMail = { to: 'dup@gmail.com', subject: 'Max: your application is now "Approved"', type: 'status-update', appId: 'app_1', body: '<p>x</p>' };
  const d1 = await mailer.sendMail(appMail);
  const d2 = await mailer.sendMail(appMail);
  const d3 = await mailer.sendMail({ ...appMail, subject: 'Max: your application is now "Adoption Scheduled"' });
  const d4 = await mailer.sendMail({ ...appMail, appId: 'app_2' });
  check('The same email about the same application within 2 minutes is sent once', d1.status === 'sent' && d2.status === 'skipped' && /2 minutes/.test(d2.error));
  check('A different status or a different application is still sent', d3.status === 'sent' && d4.status === 'sent' && sim.sends.length === 3);
  sim.sends = [];
  const typo = await send('someone@gmial.com');
  const bad = await send('someone@localhost');
  check('Typo and invalid domains are rejected before sending', typo.status === 'skipped' && /gmail\.com/.test(typo.error) && bad.status === 'skipped' && sim.sends.length === 0);

  console.log('\nExpired Gmail sign-in');
  sim.plan = [401]; sim.tokenError = 'invalid_grant';
  r = await send('signin@gmail.com');
  let health = await mailer.mailHealth();
  check('invalid_grant is reported to admins with the fix', r.status === 'failed' && health.problems.some((x) => x.code === 'auth' && /create a new refresh token/.test(x.message)));
  sim.tokenError = null;
  r = await send('signin2@gmail.com');
  health = await mailer.mailHealth();
  check('The warning clears after the next successful send', r.status === 'sent' && !health.problems.some((x) => x.code === 'auth'));

  console.log('\nDaily limit');
  health = await mailer.mailHealth();
  check('Health shows the provider and today\'s count against the limit', health.provider === 'gmail' && health.dailyLimit === 15 && health.sentToday > 0
    && health.date === mailer.melbourneDate());
  for (let i = health.sentToday; i < 15; i++) await send(`fill${i}@gmail.com`);
  sim.sends = [];
  r = await send('over@gmail.com');
  health = await mailer.mailHealth();
  check('Over the limit: email deferred, nothing sent, admin warned', r.status === 'deferred' && /limit/.test(r.error) && sim.sends.length === 0
    && health.sentToday === 15 && health.deferredToday === 1 && health.problems.some((x) => x.code === 'limit'));

  await db.flush?.();
  console.log(failures.length ? `\n❌ ${passed} passed, ${failures.length} failed` : `\n✅ ${passed} passed, 0 failed`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
