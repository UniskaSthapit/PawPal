// Authentication: sign up, email verification, login, logout, forgot/reset password.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { emails } = require('../services/mailer');
const { setAuthCookie, clearAuthCookie, publicUser, requireAuth, isStaffRole } = require('../middleware/auth');
const { notify } = require('../services/notify');
const { sendSms, toE164 } = require('../services/sms');
const crypto = require('crypto');
const { newId, now, randomToken, hashToken, asyncHandler, clean, isEmail, passwordProblem, HttpError } = require('../utils');

const router = express.Router();

// Slow down brute-force attempts on login / sign up / reset
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

async function sendVerification(user) {
  const token = randomToken();
  await db.update('users', user.id, { verifyTokenHash: hashToken(token), verifyTokenExpires: Date.now() + DAY });
  await emails.verify(user, `${config.appUrl}/verify.html?token=${token}`);
}

// ---- Sign up (adopters only — staff accounts are created by staff in Settings) ----
router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const { password } = req.body;
  if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  const pwIssue = passwordProblem(password);
  if (pwIssue) throw new HttpError(400, pwIssue);
  if (await db.findOne('users', { email })) throw new HttpError(409, 'An account with this email already exists. Try logging in.');

  const user = { id: newId('user'), name, email, passwordHash: await bcrypt.hash(password, 10), role: 'user',
    emailVerified: false, tokenVersion: 0, active: true, createdAt: now() };
  await db.insert('users', user);
  await sendVerification(user);
  res.status(201).json({ message: 'Account created. Check your email to verify your account.', email });
}));

// ---- Verify email from the link ----
router.post('/verify-email', asyncHandler(async (req, res) => {
  const token = clean(req.body.token, 200);
  if (!token) throw new HttpError(400, 'Verification link is missing its token.');
  const user = await db.findOne('users', { verifyTokenHash: hashToken(token) });
  if (!user) throw new HttpError(400, 'This verification link is invalid or has already been used.');
  if (user.verifyTokenExpires < Date.now()) throw new HttpError(400, 'This verification link has expired. Log in to request a new one.');
  await db.update('users', user.id, { emailVerified: true, verifyTokenHash: null, verifyTokenExpires: null });
  await notify(user.id, { type: 'account', title: 'Email verified',
    message: 'Your account is ready. Tell PawPal about your lifestyle to see pets that could suit you.', link: 'ai-matching.html' });
  res.json({ message: 'Email verified. You can now log in.' });
}));

router.post('/resend-verification', authLimiter, asyncHandler(async (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const user = email && await db.findOne('users', { email });
  if (user && !user.emailVerified) await sendVerification(user);
  // Same answer either way so nobody can probe which emails are registered
  res.json({ message: 'If that account needs verifying, a new link is on its way.' });
}));

// ---- Login ----
router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const { password, role, remember } = req.body;
  const user = email && await db.findOne('users', { email });
  const ok = user && user.active !== false && await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!ok) throw new HttpError(401, 'Incorrect email or password.');
  if (role === 'staff' && !isStaffRole(user.role)) throw new HttpError(403, 'This is not a staff account. Use the Adopter tab.');
  if (role === 'user' && isStaffRole(user.role)) throw new HttpError(403, 'This is a shelter staff account. Use the Shelter staff tab.');
  if (!user.emailVerified) {
    return res.status(403).json({ error: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED', email: user.email });
  }
  await db.update('users', user.id, { lastLoginAt: now() });
  setAuthCookie(res, user, Boolean(remember));
  res.json({ user: publicUser(user), redirect: isStaffRole(user.role) ? 'index.html' : 'dashboard.html' });
}));

router.post('/logout', (req, res) => { clearAuthCookie(res); res.json({ message: 'Logged out.' }); });

router.get('/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

// ---- Forgot / reset password ----
router.post('/forgot-password', authLimiter, asyncHandler(async (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const user = email && await db.findOne('users', { email });
  if (user && user.active !== false) {
    const token = randomToken();
    await db.update('users', user.id, { resetTokenHash: hashToken(token), resetTokenExpires: Date.now() + HOUR });
    await emails.resetPassword(user, `${config.appUrl}/reset-password.html?token=${token}`);
  }
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
}));

router.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
  const token = clean(req.body.token, 200);
  const pwIssue = passwordProblem(req.body.password);
  if (pwIssue) throw new HttpError(400, pwIssue);
  const user = token && await db.findOne('users', { resetTokenHash: hashToken(token) });
  if (!user || user.resetTokenExpires < Date.now()) throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.');
  await db.update('users', user.id, { passwordHash: await bcrypt.hash(req.body.password, 10), resetTokenHash: null,
    resetTokenExpires: null, emailVerified: true, tokenVersion: (user.tokenVersion || 0) + 1 });
  res.json({ message: 'Password updated. You can now log in.' });
}));

// ---- Phone verification (one-time code by SMS) ----
const MIN = 60 * 1000;
const phoneLimiter = rateLimit({ windowMs: 60 * MIN, limit: 8, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || rateLimit.ipKeyGenerator(req.ip),
  message: { error: 'Too many code requests. Please wait an hour and try again.' } });

router.post('/phone/send', requireAuth, phoneLimiter, asyncHandler(async (req, res) => {
  const phone = toE164(req.body.countryCode, req.body.phone);
  if (!phone) throw new HttpError(400, 'Please enter a valid mobile number, including the country code.');
  const last = (await db.find('phoneCodes', { userId: req.user.id })).sort((a, b) => b.sentAt - a.sentAt)[0];
  if (last && Date.now() - last.sentAt < MIN) throw new HttpError(429, 'Please wait a minute before requesting another code.');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await sendSms(phone, `Your PawPal verification code is ${code}. It expires in 10 minutes. Never share this code.`);
  await db.removeWhere('phoneCodes', { userId: req.user.id });
  await db.insert('phoneCodes', { id: newId('otp'), userId: req.user.id, phone, codeHash: hashToken(`${req.user.id}:${code}`),
    expires: Date.now() + 10 * MIN, attempts: 0, sentAt: Date.now() });
  res.json({ message: `We sent a 6-digit code to ${phone.slice(0, -4).replace(/\d/g, '•')}${phone.slice(-4)}.`, phone });
}));

router.post('/phone/verify', requireAuth, authLimiter, asyncHandler(async (req, res) => {
  const code = clean(String(req.body.code ?? ''), 10).replace(/\D/g, '');
  const rec = await db.findOne('phoneCodes', { userId: req.user.id });
  if (!rec) throw new HttpError(400, 'Request a new code first.');
  if (rec.expires < Date.now()) { await db.remove('phoneCodes', rec.id); throw new HttpError(400, 'That code has expired. Please request a new one.'); }
  if (rec.attempts >= 5) { await db.remove('phoneCodes', rec.id); throw new HttpError(429, 'Too many incorrect attempts. Please request a new code.'); }
  const ok = code.length === 6 && crypto.timingSafeEqual(Buffer.from(hashToken(`${req.user.id}:${code}`)), Buffer.from(rec.codeHash));
  if (!ok) {
    await db.update('phoneCodes', rec.id, { attempts: rec.attempts + 1 });
    throw new HttpError(400, `That code is not right. ${4 - rec.attempts} attempt${4 - rec.attempts === 1 ? '' : 's'} left.`);
  }
  await db.remove('phoneCodes', rec.id);
  const user = await db.update('users', req.user.id, { phone: rec.phone, phoneVerified: true, phoneVerifiedAt: now() });
  await notify(user.id, { type: 'account', title: 'Mobile number verified', message: `${rec.phone} is now verified on your account.`, link: 'profile.html' });
  res.json({ user: publicUser(user), message: 'Your mobile number is verified.' });
}));

module.exports = router;
