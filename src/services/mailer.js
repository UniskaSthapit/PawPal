// Email service. The first configured provider is used:
// - GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN: the Gmail API over HTTPS, sending as your own
//                   Gmail address (best inbox placement for a Gmail sender; about 500 emails a day).
// - RESEND_API_KEY: Resend over HTTPS (needs a domain you own for the sender).
// - BREVO_API_KEY:  Brevo over HTTPS — can send from a single verified address such as a Gmail account.
// - SMTP_HOST:      any SMTP server (note: Render's free plan blocks SMTP ports).
// - none:           "dev mailbox" mode — emails are saved to the database and shown at /dev-mailbox.html
//                   (local development only; disabled in production).
const nodemailer = require('nodemailer');
const config = require('../config');
const db = require('../db');
const { newId, now, escapeHtml } = require('../utils');

const gmailReady = Boolean(config.gmail.clientId && config.gmail.clientSecret && config.gmail.refreshToken);
const emailMode = gmailReady ? 'gmail' : config.resendApiKey ? 'resend' : config.brevoApiKey ? 'brevo' : config.smtp.host ? 'smtp' : 'dev';
const resendEnabled = emailMode === 'resend';
const smtpEnabled = emailMode === 'smtp';
const transporter = smtpEnabled
  ? nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    family: 4,
    connectionTimeout: 15000,
  })
  : null;

// Replies go to the MAIL_FROM address
const replyTo = () => parseFrom(config.mailFrom);

// "PawPal <team@example.com>" → { name: 'PawPal', email: 'team@example.com' }
function parseFrom(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: m[1].trim() || 'PawPal', email: m[2].trim() } : { name: 'PawPal', email: String(from || '').trim() };
}

// Provider errors carry the HTTP status so sendMail can tell a temporary failure (network, 5xx) from a
// permanent one (4xx: bad address, bad key…), which must never be retried.
const providerError = (name, status, detail) => Object.assign(new Error(`${name} ${status}: ${String(detail).slice(0, 300)}`), { status });

// ---- Gmail API helpers ----
// A short-lived access token is fetched with the refresh token and reused until shortly before it expires.
let gmailToken = { value: '', expires: 0 };
async function gmailAccessToken() {
  if (gmailToken.value && Date.now() < gmailToken.expires) return gmailToken.value;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.gmail.clientId, client_secret: config.gmail.clientSecret,
      refresh_token: config.gmail.refreshToken, grant_type: 'refresh_token' }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    const hint = data.error === 'invalid_grant' ? ' (the refresh token was revoked or has expired — create a new one, see DEPLOY.md)' : '';
    throw Object.assign(new Error(`Gmail sign-in ${r.status}: ${data.error_description || data.error || 'no access token'}${hint}`),
      { status: r.status, code: data.error || null });
  }
  gmailToken = { value: data.access_token, expires: Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60000 };
  return gmailToken.value;
}
// Header values with non-ASCII characters (names, "—", emoji) use RFC 2047 encoded words
const mimeHeader = (v) => (/^[\x20-\x7E]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`);
const b64lines = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
// multipart/alternative: a plain-text part first, then the branded HTML part (no attachments, ever)
function gmailRawMessage({ to, subject, html, text }) {
  const from = parseFrom(config.mailFrom);
  const sender = config.gmail.sender || from.email;
  const boundary = `pawpal-${newId('b')}`;
  const lines = [
    `From: ${mimeHeader(from.name || 'PawPal')} <${sender}>`,
    `To: ${to}`,
    `Reply-To: ${replyTo().email}`,
    `Subject: ${mimeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64lines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64lines(html),
    `--${boundary}--`,
    '',
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

const HTTP_PROVIDERS = {
  async gmail({ to, subject, html, text }) {
    const send = async (token) => fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: gmailRawMessage({ to, subject, html, text }) }),
      signal: AbortSignal.timeout(20000),
    });
    let r = await send(await gmailAccessToken());
    if (r.status === 401) { gmailToken = { value: '', expires: 0 }; r = await send(await gmailAccessToken()); }
    if (!r.ok) throw providerError('Gmail', r.status, await r.text());
  },
  async resend({ to, subject, html, text }) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to, subject, html, text, reply_to: replyTo().email }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw providerError('Resend', r.status, await r.text());
  },
  async brevo({ to, subject, html, text }) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.brevoApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(config.mailFrom), to: [{ email: to }], replyTo: { email: replyTo().email }, subject, htmlContent: html, textContent: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw providerError('Brevo', r.status, await r.text());
  },
  async smtp({ to, subject, html, text }) {
    try { await transporter.sendMail({ from: config.mailFrom, replyTo: replyTo().email, to, subject, html, text }); }
    // SMTP 4xx replies are temporary, 5xx permanent — map them onto the HTTP convention used above
    catch (err) { throw Object.assign(err, { status: err.responseCode ? (err.responseCode < 500 ? 503 : 400) : undefined }); }
  },
};

// Branded HTML wrapper so every email looks like PawPal (table layout + inline styles for email clients)
function layout({ heading, body, buttonText, buttonUrl }) {
  const button = buttonUrl ? `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 8px"><tr><td style="border-radius:999px;background:#C4452A">
      <a href="${buttonUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:700;text-decoration:none;font-size:15px;border-radius:999px">${escapeHtml(buttonText)}</a>
    </td></tr></table>
    <p style="font-size:12px;color:#7A6557;margin:16px 0 0">Button not working? Copy this address into your browser:<br>
      <span style="display:inline-block;margin-top:6px;padding:8px 10px;background:#FBF4EC;border-radius:6px;color:#2A1B12;font-family:Menlo,Consolas,monospace;font-size:12px;word-break:break-all">${escapeHtml(buttonUrl)}</span></p>` : '';
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#F6EFE6;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6EFE6"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px">
      <tr><td style="padding:0 4px 18px;font-family:Georgia,serif;font-size:24px;font-weight:700;color:#2A1B12">
        <span style="color:#C4452A">&#9679;</span> PawPal</td></tr>
      <tr><td style="background:#ffffff;border-radius:20px;padding:36px 32px;color:#2A1B12;line-height:1.65;font-size:15px;border:1px solid #EADCCD">
        <h1 style="font-family:Georgia,serif;font-size:24px;line-height:1.25;margin:0 0 16px;color:#2A1B12">${escapeHtml(heading)}</h1>
        ${body}
        ${button}
      </td></tr>
      <tr><td style="padding:20px 8px;text-align:center;font-size:12px;color:#7A6557;line-height:1.6">
        PawPal · AI-assisted pet adoption<br>You are receiving this email because of activity on your PawPal account.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Plain-text version of an email (sent alongside the HTML for clients and filters that prefer text)
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', '#9679': '•' };
function plainText({ heading, body, buttonText, buttonUrl }) {
  const text = String(body || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '').replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? m)
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return [`PawPal — ${heading}`, '', text, ...(buttonUrl ? ['', `${buttonText}: ${buttonUrl}`] : []), '',
    '—', 'PawPal · pet adoption', 'You are receiving this email because of activity on your PawPal account.'].join('\n');
}

// Addresses that can never receive mail: reserved test domains (example.com, .test, .invalid…) and the made-up
// addresses on the demo data. Sending to them only produces bounces, and repeated bounces can get the
// sending account suspended by the email provider, so they are skipped with a note in the log.
const UNDELIVERABLE = /@((.+\.)?example(\.(com|net|org))?|.+\.(test|invalid|localhost|local)|(.+\.)?pawpal\.(com|app))$/i;

// Temporary failures (network error, timeout, HTTP 5xx or 429) are retried once; 4xx never are.
const isTransient = (err) => !err.status || err.status >= 500 || err.status === 429;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function deliver(message) {
  try {
    await HTTP_PROVIDERS[emailMode](message);
    return { retried: false };
  } catch (err) {
    if (!isTransient(err)) throw err;
    console.warn(`✉️  Email to ${message.to} failed (${err.message.split('\n')[0]}) — retrying once.`);
    await sleep(config.mailRetryDelayMs);
    await HTTP_PROVIDERS[emailMode](message);
    return { retried: true };
  }
}

// ---- Sending safety (protects the sending account from being rate-limited or blocked) ----
// Today's date in Melbourne — the daily counter resets at local midnight
const melbourneDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
async function todayStats() {
  const id = melbourneDate();
  return (await db.findOne('mailStats', { id })) || db.insert('mailStats', { id, date: id, sent: 0, deferred: 0, failed: 0, limitReachedAt: null });
}
async function bumpStats(field, extra = {}) {
  const stats = await todayStats();
  return db.update('mailStats', stats.id, { [field]: (stats[field] || 0) + 1, ...extra });
}

// A Gmail sign-in problem (expired or revoked refresh token) is remembered so admins see a banner until it's fixed
async function setAuthProblem(problem) {
  const doc = { id: 'mailHealth', authError: problem ? problem.message : null, authErrorCode: problem ? problem.code : null, authErrorAt: problem ? now() : null };
  if (await db.findOne('meta', { id: 'mailHealth' })) await db.update('meta', 'mailHealth', doc);
  else await db.insert('meta', doc);
}

// Common misspellings of big providers, and syntax no real domain has — never worth sending to
const DOMAIN_TYPOS = { 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.om': 'gmail.com', 'hotmial.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'iclod.com': 'icloud.com' };
function domainProblem(address) {
  const domain = String(address || '').split('@')[1]?.toLowerCase() || '';
  if (DOMAIN_TYPOS[domain]) return `Not sent: "${domain}" looks like a typo (did you mean ${DOMAIN_TYPOS[domain]}?).`;
  const labels = domain.split('.');
  const valid = labels.length >= 2 && labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) && /^[a-z]{2,24}$/.test(labels[labels.length - 1]);
  return valid ? '' : `Not sent: "${domain || address}" is not a valid email domain.`;
}

// The same email about the same application within 2 minutes (e.g. a double click) is sent only once
const DEDUPE_MS = 2 * 60 * 1000;
async function isDuplicate({ to, type, appId, subject }) {
  if (!appId) return false;
  const since = Date.now() - DEDUPE_MS;
  return (await db.find('emails', { to, type, appId })).some((m) => m.status === 'sent' && m.subject === subject && new Date(m.sentAt).getTime() >= since);
}

// userId / appId record who and what the email is about; skipReason records an email we chose not to send
// (e.g. the recipient turned these emails off) so the admin email log explains it.
async function sendMail({ to, subject, heading, body, buttonText, buttonUrl, type = 'general', userId = null, appId = null, skipReason = '' }) {
  const html = layout({ heading: heading || subject, body, buttonText, buttonUrl });
  const text = plainText({ heading: heading || subject, body, buttonText, buttonUrl });
  const record = { id: newId('mail'), to, subject, type, userId, appId, html, link: buttonUrl || null, mode: emailMode, status: 'sent', sentAt: now() };
  const skip = (reason) => { record.status = 'skipped'; record.error = reason; };
  const realProvider = emailMode !== 'dev';
  if (skipReason) skip(skipReason);
  else if (realProvider && UNDELIVERABLE.test(String(to || '').trim())) skip('Not sent: this is a demo or test address that cannot receive email.');
  else if (domainProblem(to)) skip(domainProblem(to));
  else if (await isDuplicate({ to, type, appId, subject })) skip('Not sent: the same email was sent less than 2 minutes ago.');
  else if (!realProvider) {
    console.log(`✉️  [dev mailbox] To: ${to} | ${subject}${buttonUrl ? ' | ' + buttonUrl : ''}`);
  } else if ((await todayStats()).sent >= config.mailDailyLimit) {
    // Over the daily limit: keep the in-app notification, log the email as deferred, warn the admins
    record.status = 'deferred';
    record.error = `Not sent: today's email limit (${config.mailDailyLimit}) was reached. The in-app notification was still delivered.`;
    const stats = await todayStats();
    await bumpStats('deferred', stats.limitReachedAt ? {} : { limitReachedAt: now() });
    if (!stats.limitReachedAt) console.warn(`✉️  Daily email limit (${config.mailDailyLimit}) reached — further emails today are deferred.`);
  } else {
    try {
      const { retried } = await deliver({ to, subject, html, text });
      if (retried) record.retried = true;
      await bumpStats('sent');
      if ((await db.findOne('meta', { id: 'mailHealth' }))?.authError) await setAuthProblem(null);
    } catch (err) {
      record.status = 'failed';
      record.error = err.message;
      await bumpStats('failed');
      if (err.code === 'invalid_grant') await setAuthProblem({ message: 'Gmail sign-in expired — create a new refresh token (see DEPLOY.md).', code: err.code });
      console.error(`✉️  Email failed (${emailMode}):`, err.message);
    }
  }
  // Keep a copy for the dev mailbox and delivery statistics; links in real emails are not needed after sending
  await db.insert('emails', emailMode === 'dev' ? { ...record, text } : { ...record, html: undefined, link: undefined });
  return record;
}

// What the admin screens show: provider, today's count against the limit, and any problem needing action
async function mailHealth() {
  const stats = await todayStats();
  const health = await db.findOne('meta', { id: 'mailHealth' });
  const labels = { gmail: 'Gmail API', resend: 'Resend API', brevo: 'Brevo API', smtp: 'SMTP', dev: 'Dev mailbox (no email provider configured)' };
  const problems = [];
  if (health?.authError) problems.push({ code: 'auth', message: health.authError, at: health.authErrorAt });
  if (emailMode !== 'dev' && stats.sent >= config.mailDailyLimit) {
    problems.push({ code: 'limit', message: `Today's email limit (${config.mailDailyLimit}) has been reached. Emails are deferred until midnight (Melbourne time); in-app notifications still work.`, at: stats.limitReachedAt });
  }
  return { provider: emailMode, providerLabel: labels[emailMode], sender: emailMode === 'gmail' ? config.gmail.sender : parseFrom(config.mailFrom).email,
    date: stats.date, sentToday: stats.sent || 0, deferredToday: stats.deferred || 0, failedToday: stats.failed || 0, dailyLimit: config.mailDailyLimit, problems };
}

// ---------- Ready-made emails used by the app ----------
const p = (text) => `<p style="margin:0 0 12px">${text}</p>`;
const first = (name) => escapeHtml(String(name || 'there').split(' ')[0]);
const when = (iso) => new Date(iso).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' });
const quote = (text) => `<div style="margin:16px 0;padding:14px 16px;background:#FBF4EC;border-left:4px solid #C4452A;border-radius:8px;white-space:pre-wrap">${escapeHtml(text)}</div>`;

// Who/what an application email is about, plus an optional reason not to send it (set by emailApplicant)
const appMeta = (app) => ({ userId: app.userId || null, appId: app.id || null, skipReason: app.skipReason || '' });

// What the adopter is told for each workflow status
const STATUS_COPY = {
  'Under Review': (a) => p(`Good news — a member of our team has started reviewing your application for <b>${escapeHtml(a.petName)}</b>.`),
  'Info Requested': (a) => p(`We need a little more information before we can continue with your application for <b>${escapeHtml(a.petName)}</b>. Please reply from your dashboard.`),
  Interview: (a) => p(`We'd love to have a quick chat with you about <b>${escapeHtml(a.petName)}</b>.`) + (a.appointmentAt ? p(`<b>When:</b> ${when(a.appointmentAt)}`) : ''),
  'Meet & Greet': (a) => p(`It's time to meet <b>${escapeHtml(a.petName)}</b> in person!`) + (a.appointmentAt ? p(`<b>When:</b> ${when(a.appointmentAt)}<br>Please bring photo ID and, if you rent, your landlord's pet approval.`) : ''),
  Approved: (a) => p(`Your application for <b>${escapeHtml(a.petName)}</b> has been <b>approved</b>! We'll be in touch to book your go-home day.`),
  'Adoption Scheduled': (a) => p(`Your go-home day with <b>${escapeHtml(a.petName)}</b> is booked.`) + (a.appointmentAt ? p(`<b>When:</b> ${when(a.appointmentAt)}`) : ''),
  Declined: (a) => p(`Thank you for applying to adopt <b>${escapeHtml(a.petName)}</b>. After careful consideration we are unable to proceed with this application.`)
    + p('Please don\'t be discouraged — every pet has different needs, and PawPal\'s matching can suggest companions that may suit your home better.'),
  Submitted: (a) => p(`Your application for <b>${escapeHtml(a.petName)}</b> is back in the review queue.`),
};

const emails = {
  // Every in-app notification without a more specific email gets this one (see services/notify.js)
  notification: (user, { title, message, link }, extra = {}) => sendMail({
    to: user.email, type: 'notification', userId: user.id, subject: title, heading: title,
    body: p(`Hi ${first(user.name)},`) + p(escapeHtml(message || '')),
    buttonText: 'Open PawPal', buttonUrl: `${config.appUrl}/${String(link || 'dashboard.html').replace(/^\//, '')}`, ...extra,
  }),
  verify: (user, link) => sendMail({
    to: user.email, type: 'verification', subject: 'Verify your PawPal email',
    heading: `Welcome to PawPal, ${first(user.name)}!`,
    body: p('Please confirm your email address to activate your account. This link expires in 24 hours.'),
    buttonText: 'Verify my email', buttonUrl: link,
  }),
  resetPassword: (user, link) => sendMail({
    to: user.email, type: 'password-reset', subject: 'Reset your PawPal password',
    heading: 'Reset your password',
    body: p('We received a request to reset your password. This link expires in 1 hour and can only be used once.') +
      p('If you did not ask for this, you can ignore this email — your password will not change.'),
    buttonText: 'Choose a new password', buttonUrl: link,
  }),
  staffInvite: (user, link, roleLabel = 'staff') => sendMail({
    to: user.email, type: 'staff-invite', subject: 'You have been invited to PawPal',
    heading: `Hi ${first(user.name)}, you've been added to PawPal`,
    body: p(`A ${escapeHtml(roleLabel)} account has been created for you on the PawPal shelter portal.`) +
      p(`Your login email is <b>${escapeHtml(user.email)}</b>. Choose a password to finish setting up your account.`) +
      p('This link works once and expires in 7 days. If it expires, use “Forgot password” on the log in page or ask your administrator to resend the invite.'),
    buttonText: 'Set up my account', buttonUrl: link,
  }),
  ownerSetup: (user, link) => sendMail({
    to: user.email, type: 'password-reset', subject: 'Set up your PawPal administrator account',
    heading: 'Your PawPal administrator account is ready',
    body: p('This address has been set as the administrator of your PawPal site. Choose a password to finish setting up your account.') +
      p('This link works once and expires in 24 hours. If it expires, use “Forgot password” on the log in page.'),
    buttonText: 'Choose my password', buttonUrl: link,
  }),
  applicationReceived: (app) => sendMail({
    ...appMeta(app), to: app.email, type: 'application', subject: `We received your application for ${app.petName}`,
    heading: 'Application received',
    body: p(`Thank you, ${first(app.name)}! Your adoption application for <b>${escapeHtml(app.petName)}</b> has been submitted.`) +
      p('Our shelter team usually starts reviewing applications within 2–3 business days. You can follow every step on your adoption timeline.'),
    buttonText: 'Track my application', buttonUrl: `${config.appUrl}/my-applications.html?id=${app.id}`,
  }),
  statusChanged: (app, note = '') => sendMail({
    ...appMeta(app), to: app.email, type: 'status-update', subject: `${app.petName}: your application is now "${app.status}"`,
    heading: `Your application is now: ${app.status}`,
    body: p(`Hi ${first(app.name)},`) + (STATUS_COPY[app.status] ? STATUS_COPY[app.status](app) : p(`There is an update on your application for <b>${escapeHtml(app.petName)}</b>.`)) +
      (note ? p('<b>Message from the shelter:</b>') + quote(note) : ''),
    buttonText: app.status === 'Info Requested' ? 'Reply to the shelter' : 'View my timeline', buttonUrl: `${config.appUrl}/my-applications.html?id=${app.id}`,
  }),
  adoptionClosed: (app) => sendMail({
    ...appMeta(app), to: app.email, type: 'closure', subject: `${app.petName} has found a home`,
    heading: `${app.petName} has been adopted`,
    body: p(`Hi ${first(app.name)}, thank you for your interest in <b>${escapeHtml(app.petName)}</b>. ` +
      'They have now been adopted by another family, so this application has been closed.') +
      p('There are many more pets waiting for someone like you. PawPal matching can help you find your next best friend.'),
    buttonText: 'Find my PawPal', buttonUrl: `${config.appUrl}/ai-matching.html`,
  }),
  adoptionComplete: (app) => sendMail({
    ...appMeta(app), to: app.email, type: 'closure', subject: `Congratulations on adopting ${app.petName}!`,
    heading: `Welcome home, ${app.petName}!`,
    body: p(`Congratulations ${first(app.name)}! Your adoption of <b>${escapeHtml(app.petName)}</b> is complete.`) +
      p('A first vet check-up within two weeks is a great start. PawPal\'s vet finder can show clinics near you.') +
      (app.feeDue > 0 ? p(`The adoption fee of <b>$${Number(app.feeDue).toFixed(2)}</b> can be paid online from <a href="${config.appUrl}/my-applications.html?id=${app.id}">My applications</a> or at the shelter.`) : ''),
    buttonText: 'Find a nearby vet', buttonUrl: `${config.appUrl}/vet-finder.html`,
  }),
  // Receipt for the simulated adoption-fee payment (only brand + last 4 digits are ever known)
  paymentReceipt: (user, payment, app) => sendMail({
    to: user.email, type: 'receipt', userId: user.id, appId: app.id, subject: `Receipt ${payment.receiptNo}: adoption fee for ${app.petName}`,
    heading: 'Thank you — adoption fee received',
    body: p(`Hi ${first(user.name)}, thank you for paying the adoption fee for <b>${escapeHtml(app.petName)}</b>.`)
      + p(`<b>Amount:</b> $${Number(payment.amount).toFixed(2)} AUD<br><b>Paid with:</b> ${escapeHtml(payment.last4 ? `${payment.brand} ending ${payment.last4}` : payment.brand)}<br>`
        + `<b>Receipt number:</b> ${escapeHtml(payment.receiptNo)}<br><b>Date:</b> ${escapeHtml(new Date(payment.paidAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' }))}`)
      + p('<i>PawPal payment simulation — no real money was taken.</i>'),
    buttonText: 'View receipt', buttonUrl: `${config.appUrl}/receipt.html?id=${payment.id}`,
  }),
  shelterMessage: (app, text) => sendMail({
    ...appMeta(app), to: app.email, type: 'message', subject: `New message about your application for ${app.petName}`,
    heading: 'You have a new message',
    body: p(`Hi ${first(app.name)}, the shelter team sent you a message about <b>${escapeHtml(app.petName)}</b>.`) + quote(text),
    buttonText: 'Reply on PawPal', buttonUrl: `${config.appUrl}/my-applications.html?id=${app.id}`,
  }),
  bookingInvite: (app, message = '') => sendMail({
    ...appMeta(app), to: app.email, type: 'booking', subject: `Book a time to meet ${app.petName}`,
    heading: `Choose a time to meet ${app.petName}`,
    body: p(`Hi ${first(app.name)}, the shelter team would love you to meet <b>${escapeHtml(app.petName)}</b> in person.`) +
      p('Pick a meet &amp; greet time that suits you from the shelter\'s available times. You can change or cancel it up to 24 hours before.') +
      (message ? p('<b>Message from the shelter:</b>') + quote(message) : ''),
    buttonText: 'Choose a time', buttonUrl: `${config.appUrl}/my-applications.html?id=${app.id}#booking`,
  }),
  bookingConfirmed: (app, { rescheduled = false } = {}) => sendMail({
    ...appMeta(app), to: app.email, type: 'booking', subject: `${rescheduled ? 'New time' : 'Booked'}: meet ${app.petName} on ${when(app.appointmentAt)}`,
    heading: rescheduled ? 'Your meet & greet has moved' : 'Your meet & greet is booked',
    body: p(`Hi ${first(app.name)}, you're booked to meet <b>${escapeHtml(app.petName)}</b>.`) + p(`<b>When:</b> ${when(app.appointmentAt)}`) +
      p('Please bring photo ID and, if you rent, your landlord\'s pet approval. You can add it to your calendar from your timeline, and change or cancel it up to 24 hours before.'),
    buttonText: 'View my booking', buttonUrl: `${config.appUrl}/my-applications.html?id=${app.id}#booking`,
  }),
  bookingCancelled: (app, startedAt) => sendMail({
    ...appMeta(app), to: app.email, type: 'booking', subject: `Cancelled: meet & greet with ${app.petName}`,
    heading: 'Your meet & greet was cancelled',
    body: p(`Hi ${first(app.name)}, your meet &amp; greet with <b>${escapeHtml(app.petName)}</b>${startedAt ? ` on ${when(startedAt)}` : ''} has been cancelled.`) +
      p('Your application is still open — choose another time whenever you\'re ready.'),
    buttonText: 'Choose another time', buttonUrl: `${config.appUrl}/my-applications.html?id=${app.id}#booking`,
  }),
  enquiryReceived: (enq) => sendMail({
    to: enq.email, type: 'enquiry', subject: `Your question about ${enq.petName}`,
    heading: 'We got your question',
    body: p(`Thanks ${first(enq.name)} — your question about <b>${escapeHtml(enq.petName)}</b> has been sent to the shelter team.`) + quote(enq.message),
    buttonText: 'View my enquiries', buttonUrl: `${config.appUrl}/dashboard.html#enquiries`,
  }),
  enquiryReply: (enq) => sendMail({
    to: enq.email, type: 'enquiry', subject: `The shelter replied about ${enq.petName}`,
    heading: `A reply about ${enq.petName}`,
    body: p(`Hi ${first(enq.name)}, the shelter team answered your question.`) + p('<b>You asked:</b>') + quote(enq.message) + p('<b>Their reply:</b>') + quote(enq.reply),
    buttonText: `See ${enq.petName}'s profile`, buttonUrl: `${config.appUrl}/pet-profile.html?id=${enq.petId}`,
  }),
};

module.exports = { UNDELIVERABLE, sendMail, mailHealth, domainProblem, plainText, melbourneDate, emails, smtpEnabled, resendEnabled, emailMode, parseFrom };
