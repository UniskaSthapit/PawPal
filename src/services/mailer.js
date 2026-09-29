// Email service (Nodemailer + Resend).
// - With RESEND_API_KEY: sends real emails over HTTPS (works even where SMTP ports are blocked).
// - With SMTP settings (no Resend key): sends real emails over SMTP.
// - With neither ("dev mailbox" mode): emails are saved to the database
//   and shown at /dev-mailbox.html so verification and notifications still work.
const nodemailer = require('nodemailer');
const config = require('../config');
const db = require('../db');
const { newId, now, escapeHtml } = require('../utils');

const resendEnabled = Boolean(config.resendApiKey);
const smtpEnabled = !resendEnabled && Boolean(config.smtp.host);
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

// Resend's HTTPS API — used instead of SMTP when RESEND_API_KEY is set, since some
// hosts (Render's free plan included) block outbound SMTP ports but always allow
// normal HTTPS requests, which is how the site itself and the database already work.
async function sendViaResend({ to, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to, subject, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

// Branded HTML wrapper so every email looks like PawPal
function layout({ heading, body, buttonText, buttonUrl }) {
  const button = buttonUrl ? `
    <p style="margin:28px 0"><a href="${buttonUrl}" style="background:#C85A3E;color:#fff;text-decoration:none;
      padding:13px 26px;border-radius:10px;font-weight:600;display:inline-block">${escapeHtml(buttonText)}</a></p>
    <p style="font-size:12px;color:#6B5B4E">Or paste this link into your browser:<br>
      <a href="${buttonUrl}" style="color:#C85A3E;word-break:break-all">${buttonUrl}</a></p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#FDF8F2;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-family:Georgia,serif;font-size:26px;font-weight:700;color:#C85A3E;margin-bottom:18px">🐾 PawPal</div>
    <div style="background:#fff;border:1px solid #EDD9C8;border-radius:16px;padding:28px;color:#2A2419;line-height:1.6">
      <h1 style="font-family:Georgia,serif;font-size:22px;margin:0 0 14px">${escapeHtml(heading)}</h1>
      ${body}
      ${button}
    </div>
    <p style="font-size:12px;color:#6B5B4E;text-align:center;margin-top:18px">PawPal — Because Every Paw Matters</p>
  </div></body></html>`;
}

async function sendMail({ to, subject, heading, body, buttonText, buttonUrl, type = 'general' }) {
  const html = layout({ heading: heading || subject, body, buttonText, buttonUrl });
  const record = { id: newId('mail'), to, subject, type, html, link: buttonUrl || null,
    mode: resendEnabled ? 'resend' : smtpEnabled ? 'smtp' : 'dev', status: 'sent', sentAt: now() };

  if (resendEnabled) {
    try {
      await sendViaResend({ to, subject, html });
    } catch (err) {
      record.status = 'failed';
      record.error = err.message;
      console.error('✉️  Email failed (Resend):', err.message);
    }
  } else if (smtpEnabled) {
    try {
      await transporter.sendMail({ from: config.mailFrom, to, subject, html });
    } catch (err) {
      record.status = 'failed';
      record.error = err.message;
      console.error('✉️  Email failed:', err.message);
    }
  } else {
    console.log(`✉️  [dev mailbox] To: ${to} | ${subject}${buttonUrl ? ' | ' + buttonUrl : ''}`);
  }
  await db.insert('emails', record);
  return record;
}

// ---------- Ready-made emails used by the app ----------
const p = (text) => `<p style="margin:0 0 12px">${text}</p>`;

const emails = {
  verify: (user, link) => sendMail({
    to: user.email, type: 'verification', subject: 'Verify your PawPal email',
    heading: `Welcome to PawPal, ${user.name.split(' ')[0]}!`,
    body: p('Please confirm your email address to activate your account. This link expires in 24 hours.'),
    buttonText: 'Verify my email', buttonUrl: link,
  }),
  resetPassword: (user, link) => sendMail({
    to: user.email, type: 'password-reset', subject: 'Reset your PawPal password',
    heading: 'Reset your password',
    body: p('We received a request to reset your password. This link expires in 1 hour.') +
      p('If you did not ask for this, you can ignore this email — your password will not change.'),
    buttonText: 'Choose a new password', buttonUrl: link,
  }),
  staffInvite: (user, tempPassword) => sendMail({
    to: user.email, type: 'staff-invite', subject: 'Your PawPal staff account',
    heading: `Hi ${escapeHtml(user.name.split(' ')[0])}, you have been added to PawPal`,
    body: p('A staff account has been created for you on the PawPal shelter portal.') +
      p(`Email: <b>${escapeHtml(user.email)}</b><br>Temporary password: <b>${escapeHtml(tempPassword)}</b>`) +
      p('Please log in with the Staff Login tab and change your password in Settings.'),
    buttonText: 'Go to staff login', buttonUrl: `${config.appUrl}/login.html?role=staff`,
  }),
  applicationReceived: (app) => sendMail({
    to: app.email, type: 'application', subject: `We received your application for ${app.petName}`,
    heading: 'Application received',
    body: p(`Thank you, ${escapeHtml(app.name.split(' ')[0])}! Your adoption inquiry for <b>${escapeHtml(app.petName)}</b> has been submitted.`) +
      p('Our shelter team usually reviews applications within 2–3 business days. You can track progress any time.'),
    buttonText: 'Track my application', buttonUrl: `${config.appUrl}/my-applications.html`,
  }),
  statusChanged: (app, extra = '') => sendMail({
    to: app.email, type: 'status-update', subject: `Update on your application for ${app.petName}: ${app.status}`,
    heading: `Your application is now: ${app.status}`,
    body: p(`Hi ${escapeHtml(app.name.split(' ')[0])}, there is an update on your adoption application for <b>${escapeHtml(app.petName)}</b>.`) +
      extra,
    buttonText: 'View my application', buttonUrl: `${config.appUrl}/my-applications.html`,
  }),
  adoptionClosed: (app) => sendMail({
    to: app.email, type: 'closure', subject: `${app.petName} has found a home`,
    heading: `${app.petName} has been adopted`,
    body: p(`Hi ${escapeHtml(app.name.split(' ')[0])}, thank you for your interest in <b>${escapeHtml(app.petName)}</b>. ` +
      'They have now been adopted, so this application has been closed.') +
      p('There are many more pets waiting for someone like you. Our AI matching quiz can help you find your next best friend.'),
    buttonText: 'Find my match', buttonUrl: `${config.appUrl}/ai-matching.html`,
  }),
  adoptionComplete: (app) => sendMail({
    to: app.email, type: 'closure', subject: `Congratulations on adopting ${app.petName}! 🎉`,
    heading: `Welcome home, ${app.petName}!`,
    body: p(`Congratulations ${escapeHtml(app.name.split(' ')[0])}! Your adoption of <b>${escapeHtml(app.petName)}</b> is complete.`) +
      p('A first vet check-up within two weeks is a great start. Use our vet finder to locate clinics near you.'),
    buttonText: 'Find a nearby vet', buttonUrl: `${config.appUrl}/vet-finder.html`,
  }),
};

module.exports = { sendMail, emails, smtpEnabled };