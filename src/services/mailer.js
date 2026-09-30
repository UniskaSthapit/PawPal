// Email service. The first configured provider is used:
// - RESEND_API_KEY: Resend over HTTPS (needs a domain you own for the sender).
// - BREVO_API_KEY:  Brevo over HTTPS — can send from a single verified address such as a Gmail account.
// - SMTP_HOST:      any SMTP server (note: Render's free plan blocks SMTP ports).
// - none:           "dev mailbox" mode — emails are saved to the database and shown at /dev-mailbox.html
//                   (local development only; disabled in production).
const nodemailer = require('nodemailer');
const config = require('../config');
const db = require('../db');
const { newId, now, escapeHtml } = require('../utils');

const emailMode = config.resendApiKey ? 'resend' : config.brevoApiKey ? 'brevo' : config.smtp.host ? 'smtp' : 'dev';
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

// "PawPal <team@example.com>" → { name: 'PawPal', email: 'team@example.com' }
function parseFrom(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: m[1].trim() || 'PawPal', email: m[2].trim() } : { name: 'PawPal', email: String(from || '').trim() };
}

const HTTP_PROVIDERS = {
  async resend({ to, subject, html }) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to, subject, html }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
  },
  async brevo({ to, subject, html }) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.brevoApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(config.mailFrom), to: [{ email: to }], subject, htmlContent: html }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 300)}`);
  },
  async smtp({ to, subject, html }) {
    await transporter.sendMail({ from: config.mailFrom, to, subject, html });
  },
};

// Branded HTML wrapper so every email looks like PawPal (table layout + inline styles for email clients)
function layout({ heading, body, buttonText, buttonUrl }) {
  const button = buttonUrl ? `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 8px"><tr><td style="border-radius:999px;background:#C4452A">
      <a href="${buttonUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:700;text-decoration:none;font-size:15px;border-radius:999px">${escapeHtml(buttonText)}</a>
    </td></tr></table>
    <p style="font-size:12px;color:#7A6557;margin:16px 0 0">Button not working? Paste this link into your browser:<br>
      <a href="${buttonUrl}" style="color:#A8361E;word-break:break-all">${buttonUrl}</a></p>` : '';
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

async function sendMail({ to, subject, heading, body, buttonText, buttonUrl, type = 'general' }) {
  const html = layout({ heading: heading || subject, body, buttonText, buttonUrl });
  const record = { id: newId('mail'), to, subject, type, html, link: buttonUrl || null, mode: emailMode, status: 'sent', sentAt: now() };
  if (emailMode === 'dev') {
    console.log(`✉️  [dev mailbox] To: ${to} | ${subject}${buttonUrl ? ' | ' + buttonUrl : ''}`);
  } else {
    try {
      await HTTP_PROVIDERS[emailMode]({ to, subject, html });
    } catch (err) {
      record.status = 'failed';
      record.error = err.message;
      console.error(`✉️  Email failed (${emailMode}):`, err.message);
    }
  }
  // Keep a copy for the dev mailbox and delivery statistics; links in real emails are not needed after sending
  await db.insert('emails', emailMode === 'dev' ? record : { ...record, html: undefined, link: undefined });
  return record;
}

// ---------- Ready-made emails used by the app ----------
const p = (text) => `<p style="margin:0 0 12px">${text}</p>`;
const first = (name) => escapeHtml(String(name || 'there').split(' ')[0]);
const when = (iso) => new Date(iso).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' });
const quote = (text) => `<div style="margin:16px 0;padding:14px 16px;background:#FBF4EC;border-left:4px solid #C4452A;border-radius:8px;white-space:pre-wrap">${escapeHtml(text)}</div>`;

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
    to: app.email, type: 'application', subject: `We received your application for ${app.petName}`,
    heading: 'Application received',
    body: p(`Thank you, ${first(app.name)}! Your adoption application for <b>${escapeHtml(app.petName)}</b> has been submitted.`) +
      p('Our shelter team usually starts reviewing applications within 2–3 business days. You can follow every step on your adoption timeline.'),
    buttonText: 'Track my application', buttonUrl: `${config.appUrl}/my-applications.html?id=${app.id}`,
  }),
  statusChanged: (app, note = '') => sendMail({
    to: app.email, type: 'status-update', subject: `${app.petName}: your application is now "${app.status}"`,
    heading: `Your application is now: ${app.status}`,
    body: p(`Hi ${first(app.name)},`) + (STATUS_COPY[app.status] ? STATUS_COPY[app.status](app) : p(`There is an update on your application for <b>${escapeHtml(app.petName)}</b>.`)) +
      (note ? p('<b>Message from the shelter:</b>') + quote(note) : ''),
    buttonText: app.status === 'Info Requested' ? 'Reply to the shelter' : 'View my timeline', buttonUrl: `${config.appUrl}/my-applications.html?id=${app.id}`,
  }),
  adoptionClosed: (app) => sendMail({
    to: app.email, type: 'closure', subject: `${app.petName} has found a home`,
    heading: `${app.petName} has been adopted`,
    body: p(`Hi ${first(app.name)}, thank you for your interest in <b>${escapeHtml(app.petName)}</b>. ` +
      'They have now been adopted by another family, so this application has been closed.') +
      p('There are many more pets waiting for someone like you. PawPal matching can help you find your next best friend.'),
    buttonText: 'Find my PawPal', buttonUrl: `${config.appUrl}/ai-matching.html`,
  }),
  adoptionComplete: (app) => sendMail({
    to: app.email, type: 'closure', subject: `Congratulations on adopting ${app.petName}!`,
    heading: `Welcome home, ${app.petName}!`,
    body: p(`Congratulations ${first(app.name)}! Your adoption of <b>${escapeHtml(app.petName)}</b> is complete.`) +
      p('A first vet check-up within two weeks is a great start. PawPal\'s vet finder can show clinics near you.'),
    buttonText: 'Find a nearby vet', buttonUrl: `${config.appUrl}/vet-finder.html`,
  }),
  shelterMessage: (app, text) => sendMail({
    to: app.email, type: 'message', subject: `New message about your application for ${app.petName}`,
    heading: 'You have a new message',
    body: p(`Hi ${first(app.name)}, the shelter team sent you a message about <b>${escapeHtml(app.petName)}</b>.`) + quote(text),
    buttonText: 'Reply on PawPal', buttonUrl: `${config.appUrl}/my-applications.html?id=${app.id}`,
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

module.exports = { sendMail, emails, smtpEnabled, resendEnabled, emailMode, parseFrom };
