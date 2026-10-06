// Authentication: sign up, email verification, login, logout, forgot/reset password.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { emails } = require('../services/mailer');
const jwt = require('jsonwebtoken');
const { setAuthCookie, clearAuthCookie, publicUser, requireAuth, isStaffRole } = require('../middleware/auth');
const totp = require('../services/totp');
const { getSettings } = require('../services/settings');
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
  // Two-factor accounts: the password alone only earns a short-lived "pending" cookie; the code step finishes the login
  if (user.twoFactor?.enabled) {
    setPendingCookie(res, user, Boolean(remember));
    return res.json({ twoFactorRequired: true, message: 'Enter the 6-digit code from your authenticator app.' });
  }
  return completeLogin(req, res, user, Boolean(remember));
}));

async function completeLogin(req, res, user, remember) {
  await db.update('users', user.id, { lastLoginAt: now() });
  setAuthCookie(res, user, remember);
  const mustSetup = isStaffRole(user.role) && !user.twoFactor?.enabled && (await getSettings()).requireStaff2fa;
  res.json({ user: publicUser(user), ...(mustSetup ? { twoFactorSetupRequired: true } : {}),
    redirect: mustSetup ? 'settings.html#twofactor' : isStaffRole(user.role) ? 'index.html' : 'dashboard.html' });
}

// ---- Two-factor authentication (staff and administrators) ----
const PENDING_COOKIE = 'pawpal_2fa';
const PENDING_MINUTES = 5;
const pendingCookieOptions = { httpOnly: true, sameSite: 'strict', secure: config.isProd };
function setPendingCookie(res, user, remember) {
  const token = jwt.sign({ sub: user.id, v: user.tokenVersion || 0, p: '2fa', r: remember ? 1 : 0 }, config.jwtSecret, { expiresIn: `${PENDING_MINUTES}m` });
  res.cookie(PENDING_COOKIE, token, { ...pendingCookieOptions, maxAge: PENDING_MINUTES * 60 * 1000 });
}
const clearPendingCookie = (res) => res.clearCookie(PENDING_COOKIE, pendingCookieOptions);

// Stricter limit for code guesses (on top of the per-account lock below)
const twoFactorLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });
const MAX_CODE_FAILURES = 5;

// Checks a 6-digit app code or a one-time backup code against the user's 2FA.
// Returns { method, lastStep } or { method, backupCodes, left }, or null when the code is wrong.
async function checkSecondFactor(user, code) {
  const tf = user.twoFactor || {};
  const step = totp.verifyTotp(totp.decryptSecret(tf.secret), code, { lastStep: tf.lastStep ?? -1 });
  if (step !== null) return { method: 'app', lastStep: step };
  const i = await totp.matchBackupCode(tf.backupCodes, code);
  if (i < 0) return null;
  const backupCodes = [...tf.backupCodes]; backupCodes[i] = null; // each backup code works once
  return { method: 'backup', backupCodes, left: backupCodes.filter(Boolean).length };
}
// Stores what a successful check used up (code step or backup code) and resets the failure counter
async function saveSecondFactorUse(user, result) {
  const tf = { ...user.twoFactor, failures: 0, lockedUntil: null };
  if (result.lastStep !== undefined) tf.lastStep = result.lastStep;
  if (result.backupCodes) tf.backupCodes = result.backupCodes;
  await db.update('users', user.id, { twoFactor: tf });
}
async function recordSecondFactorFailure(user) {
  const failures = (user.twoFactor?.failures || 0) + 1;
  const locked = failures >= MAX_CODE_FAILURES;
  await db.update('users', user.id, { twoFactor: { ...user.twoFactor, failures: locked ? 0 : failures, lockedUntil: locked ? Date.now() + 15 * 60 * 1000 : null } });
  return locked;
}
const isLocked = (user) => (user.twoFactor?.lockedUntil || 0) > Date.now();

// Step 2 of login: code from the authenticator app (or a backup code) → the normal login cookie
router.post('/2fa/verify', twoFactorLimiter, asyncHandler(async (req, res) => {
  let pending;
  try { pending = jwt.verify(req.cookies?.[PENDING_COOKIE] || '', config.jwtSecret); } catch { pending = null; }
  if (!pending || pending.p !== '2fa') throw new HttpError(401, 'Your sign-in expired. Please enter your email and password again.');
  const user = await db.findOne('users', { id: pending.sub });
  if (!user || user.active === false || (user.tokenVersion || 0) !== pending.v || !user.twoFactor?.enabled) {
    clearPendingCookie(res);
    throw new HttpError(401, 'Your sign-in expired. Please enter your email and password again.');
  }
  if (isLocked(user)) throw new HttpError(429, 'Too many incorrect codes. Please wait 15 minutes and try again.');
  const code = clean(req.body.code, 20);
  if (!code) throw new HttpError(400, 'Enter the 6-digit code from your authenticator app, or a backup code.');
  const result = await checkSecondFactor(user, code);
  if (!result) {
    const locked = await recordSecondFactorFailure(user);
    if (locked) { clearPendingCookie(res); throw new HttpError(429, 'Too many incorrect codes. Please wait 15 minutes and try again.'); }
    throw new HttpError(400, 'That code is not correct. Check the time on your phone and try the newest code.');
  }
  await saveSecondFactorUse(user, result);
  clearPendingCookie(res);
  if (result.method === 'backup') {
    await notify(user.id, { type: 'account', title: 'A backup code was used to sign in',
      message: `${result.left} backup code${result.left === 1 ? '' : 's'} left. If this wasn't you, change your password and reset two-factor authentication.`, link: 'settings.html#twofactor' });
  }
  return completeLogin(req, res, user, Boolean(pending.r));
}));

// Setup and management are for staff and administrators (requireAuth + role check, so they still work
// when "Require 2FA for staff" is on and the person hasn't set it up yet)
const staffOnly = (req) => { if (!isStaffRole(req.user.role)) throw new HttpError(403, 'Two-factor authentication is available for shelter staff and administrators.'); };

router.get('/2fa/status', requireAuth, asyncHandler(async (req, res) => {
  staffOnly(req);
  const tf = req.user.twoFactor;
  res.json({ enabled: !!tf?.enabled, enabledAt: tf?.enabledAt || null, backupCodesLeft: (tf?.backupCodes || []).filter(Boolean).length,
    required: (await getSettings()).requireStaff2fa });
}));

// Starts setup: a new secret (kept encrypted, not active yet). The secret is returned only here, to show the QR code.
router.post('/2fa/setup', requireAuth, twoFactorLimiter, asyncHandler(async (req, res) => {
  staffOnly(req);
  if (req.user.twoFactor?.enabled) throw new HttpError(400, 'Two-factor authentication is already on. Turn it off first to set it up again.');
  const secret = totp.generateSecret();
  await db.update('users', req.user.id, { twoFactorPending: { secret: totp.encryptSecret(secret), at: now() } });
  res.json({ secret, otpauthUrl: totp.otpauthUrl(secret, req.user.email), issuer: 'PawPal', account: req.user.email });
}));

// Confirms setup with a code from the app; returns the one-time backup codes (only ever shown here)
router.post('/2fa/enable', requireAuth, twoFactorLimiter, asyncHandler(async (req, res) => {
  staffOnly(req);
  const pendingSetup = req.user.twoFactorPending;
  if (!pendingSetup?.secret || Date.now() - new Date(pendingSetup.at).getTime() > 30 * 60 * 1000) {
    throw new HttpError(400, 'Setup has expired. Please start again.');
  }
  const secret = totp.decryptSecret(pendingSetup.secret);
  const step = totp.verifyTotp(secret, clean(req.body.code, 10));
  if (step === null) throw new HttpError(400, 'That code is not correct. Enter the newest 6-digit code from your app.');
  const backupCodes = totp.generateBackupCodes();
  await db.update('users', req.user.id, { twoFactorPending: null,
    twoFactor: { enabled: true, secret: pendingSetup.secret, enabledAt: now(), lastStep: step, backupCodes: await totp.hashBackupCodes(backupCodes), failures: 0, lockedUntil: null } });
  await notify(req.user.id, { type: 'account', title: 'Two-factor authentication is on',
    message: 'Your PawPal account now asks for a code from your authenticator app when you sign in.', link: 'settings.html#twofactor' });
  res.json({ enabled: true, backupCodes, message: 'Two-factor authentication is on. Save your backup codes somewhere safe — they are shown only once.' });
}));

// Turning it off needs the password and a current code (or a backup code)
router.post('/2fa/disable', requireAuth, twoFactorLimiter, asyncHandler(async (req, res) => {
  staffOnly(req);
  const user = req.user;
  if (!user.twoFactor?.enabled) throw new HttpError(400, 'Two-factor authentication is not on.');
  if ((await getSettings()).requireStaff2fa) throw new HttpError(403, 'Your administrator requires two-factor authentication for staff, so it can\'t be turned off.');
  if (!(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) throw new HttpError(400, 'Your password is incorrect.');
  if (isLocked(user)) throw new HttpError(429, 'Too many incorrect codes. Please wait 15 minutes and try again.');
  const result = await checkSecondFactor(user, clean(req.body.code, 20));
  if (!result) { await recordSecondFactorFailure(user); throw new HttpError(400, 'That code is not correct.'); }
  await db.update('users', user.id, { twoFactor: null, twoFactorPending: null });
  await notify(user.id, { type: 'account', title: 'Two-factor authentication was turned off',
    message: 'Your account no longer asks for an authenticator code. If this wasn\'t you, change your password now.', link: 'settings.html#twofactor' });
  res.json({ enabled: false, message: 'Two-factor authentication is off.' });
}));

router.post('/logout', (req, res) => { clearAuthCookie(res); clearPendingCookie(res); res.json({ message: 'Logged out.' }); });

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
