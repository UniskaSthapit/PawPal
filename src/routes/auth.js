// Authentication: sign up, email verification, login, logout, forgot/reset password.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { emails } = require('../services/mailer');
const { setAuthCookie, clearAuthCookie, publicUser } = require('../middleware/auth');
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
  await db.insert('notifications', { id: newId('note'), userId: user.id, title: 'Email verified ✅',
    message: 'Your account is ready. Take the AI matching quiz to meet pets that suit you.', link: 'ai-matching.html', read: false, at: now() });
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
  if (role === 'staff' && user.role !== 'staff') throw new HttpError(403, 'This is not a staff account. Use the User Login tab.');
  if (role === 'user' && user.role === 'staff') throw new HttpError(403, 'This is a staff account. Use the Staff Login tab.');
  if (!user.emailVerified) {
    return res.status(403).json({ error: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED', email: user.email });
  }
  await db.update('users', user.id, { lastLoginAt: now() });
  setAuthCookie(res, user, Boolean(remember));
  res.json({ user: publicUser(user), redirect: user.role === 'staff' ? 'index.html' : 'my-applications.html' });
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

module.exports = router;
