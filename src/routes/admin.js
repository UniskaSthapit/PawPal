// Administrator: manage users (roles, shelter assignment, access) and shelters.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { emails } = require('../services/mailer');
const { requireAdmin, publicUser } = require('../middleware/auth');
const { ROLES, ROLE_LABELS } = require('../constants');
const config = require('../config');
const { newId, now, asyncHandler, clean, isEmail, toBool, HttpError, randomToken, hashToken } = require('../utils');

const { getSettings, updateSettings } = require('../services/settings');
const { notify } = require('../services/notify');

const router = express.Router();
router.use(requireAdmin);

// ---- Site security settings ----
router.get('/settings', asyncHandler(async (req, res) => {
  const s = await getSettings();
  res.json({ settings: { requireStaff2fa: !!s.requireStaff2fa } });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const value = req.body?.requireStaff2fa;
  if (typeof value !== 'boolean') throw new HttpError(400, 'requireStaff2fa must be true or false.');
  // Turning the requirement on while your own account has no 2FA would lock you out of the admin pages
  if (value && !req.user.twoFactor?.enabled) throw new HttpError(400, 'Turn on two-factor authentication for your own account first (Settings → Two-factor authentication).');
  const s = await updateSettings({ requireStaff2fa: value }, req.user.id);
  res.json({ settings: { requireStaff2fa: s.requireStaff2fa },
    message: value ? 'Two-factor authentication is now required for all staff and administrators.' : 'Two-factor authentication is now optional.' });
}));

// Emails a single-use "choose your password" link (valid 7 days). Returns the send result so failures are shown to the admin.
async function sendInvite(user) {
  const token = randomToken();
  await db.update('users', user.id, { resetTokenHash: hashToken(token), resetTokenExpires: Date.now() + 7 * 24 * 60 * 60 * 1000, invitedAt: now() });
  const mail = await emails.staffInvite(user, `${config.appUrl}/reset-password.html?token=${token}`, ROLE_LABELS[user.role].toLowerCase());
  return mail.status === 'sent' ? { sent: true } : { sent: false, error: mail.error || 'The email provider rejected the message.' };
}
const inviteMessage = (name, r) => (r.sent ? `Invitation sent to ${name}. Ask them to check their inbox (and spam folder).`
  : `${name}'s invitation email could not be sent (${r.error}). Check the email settings, then use "Resend invite".`);

// ---- Users ----
router.get('/users', asyncHandler(async (req, res) => {
  let users = await db.find('users');
  if (req.query.role) users = users.filter((u) => u.role === req.query.role);
  const q = clean(req.query.q, 80).toLowerCase();
  if (q) users = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
  const apps = await db.find('applications');
  users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ users: users.map((u) => ({ ...publicUser(u), active: u.active !== false, lastLoginAt: u.lastLoginAt || null, invitedAt: u.invitedAt || null,
    applications: apps.filter((a) => a.userId === u.id).length })), roles: ROLES.map((r) => ({ id: r, label: ROLE_LABELS[r] })) });
}));

router.post('/users', asyncHandler(async (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const role = ['staff', 'admin'].includes(req.body.role) ? req.body.role : 'staff';
  const shelterId = clean(req.body.shelterId, 40) || null;
  if (name.length < 2) throw new HttpError(400, 'Please enter their name.');
  if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (await db.findOne('users', { email })) throw new HttpError(409, 'Someone already uses this email.');
  if (role === 'staff' && !shelterId) throw new HttpError(400, 'Choose which shelter this staff member works at.');
  // No password is ever emailed: the account gets an unusable random password until they choose one from the invite link
  const user = { id: newId('user'), name, email, passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10), role, shelterId,
    emailVerified: true, tokenVersion: 0, active: true, createdAt: now() };
  await db.insert('users', user);
  const r = await sendInvite(user);
  res.status(201).json({ user: publicUser(user), emailSent: r.sent, message: inviteMessage(name, r) });
}));

// Resets a team member's 2FA (lost phone). They sign in with their password and can set it up again.
router.post('/users/:id/2fa/reset', asyncHandler(async (req, res) => {
  const user = await db.findOne('users', { id: req.params.id });
  if (!user) throw new HttpError(404, 'User not found.');
  if (user.id === req.user.id) throw new HttpError(400, 'Use Settings → Two-factor authentication to change your own.');
  if (!user.twoFactor?.enabled) throw new HttpError(400, `${user.name} doesn't have two-factor authentication turned on.`);
  await db.update('users', user.id, { twoFactor: null, twoFactorPending: null, tokenVersion: (user.tokenVersion || 0) + 1 });
  await notify(user.id, { type: 'account', title: 'Two-factor authentication was reset',
    message: `An administrator (${req.user.name}) reset two-factor authentication on your account. Set it up again in Settings.`, link: 'settings.html#twofactor' });
  res.json({ message: `Two-factor authentication was reset for ${user.name}. They have been signed out everywhere.` });
}));

// Re-sends the "verify your email" link to an adopter who hasn't verified yet
router.post('/users/:id/verification', asyncHandler(async (req, res) => {
  const user = await db.findOne('users', { id: req.params.id });
  if (!user) throw new HttpError(404, 'User not found.');
  if (user.emailVerified) throw new HttpError(400, 'This email address is already verified.');
  const token = randomToken();
  await db.update('users', user.id, { verifyTokenHash: hashToken(token), verifyTokenExpires: Date.now() + 24 * 60 * 60 * 1000 });
  const mail = await emails.verify(user, `${config.appUrl}/verify.html?token=${token}`);
  if (mail.status !== 'sent') return res.status(502).json({ error: `The verification email to ${user.email} could not be sent (${mail.error || 'provider error'}).` });
  res.json({ message: `Verification email sent to ${user.email}.` });
}));

router.post('/users/:id/invite', asyncHandler(async (req, res) => {
  const user = await db.findOne('users', { id: req.params.id });
  if (!user) throw new HttpError(404, 'User not found.');
  if (user.id === req.user.id) throw new HttpError(400, 'You are already set up.');
  if (user.role === 'user') throw new HttpError(400, 'Invitations are for staff and administrators.');
  if (user.active === false) throw new HttpError(400, 'Reactivate this account before resending the invite.');
  const r = await sendInvite(user);
  res.status(r.sent ? 200 : 502).json({ emailSent: r.sent, message: inviteMessage(user.name, r), ...(r.sent ? {} : { error: inviteMessage(user.name, r) }) });
}));

router.patch('/users/:id', asyncHandler(async (req, res) => {
  const target = await db.findOne('users', { id: req.params.id });
  if (!target) throw new HttpError(404, 'User not found.');
  const patch = {};
  if (req.body.role !== undefined) {
    if (!ROLES.includes(req.body.role)) throw new HttpError(400, 'Unknown role.');
    if (target.id === req.user.id && req.body.role !== 'admin') throw new HttpError(400, 'You cannot remove your own administrator access.');
    patch.role = req.body.role;
  }
  if (req.body.shelterId !== undefined) {
    const sid = clean(req.body.shelterId, 40) || null;
    if (sid && !(await db.findOne('shelters', { id: sid }))) throw new HttpError(400, 'Unknown shelter.');
    patch.shelterId = sid;
  }
  if (req.body.active !== undefined) {
    if (target.id === req.user.id) throw new HttpError(400, 'You cannot deactivate your own account.');
    patch.active = toBool(req.body.active);
  }
  if ((patch.role || target.role) === 'staff' && !(patch.shelterId ?? target.shelterId)) throw new HttpError(400, 'Staff members need a shelter.');
  // Any change to access signs the user out everywhere so it takes effect immediately
  patch.tokenVersion = (target.tokenVersion || 0) + 1;
  const user = await db.update('users', target.id, patch);
  res.json({ user: { ...publicUser(user), active: user.active !== false }, message: `${user.name} was updated.` });
}));

// ---- Shelters ----
const readShelter = (b) => {
  const s = { name: clean(b.name, 80), suburb: clean(b.suburb, 60), state: clean(b.state, 10).toUpperCase(), address: clean(b.address, 160),
    phone: clean(b.phone, 30), email: clean(b.email, 120).toLowerCase(), hours: clean(b.hours, 120), about: clean(b.about, 600) };
  if (s.name.length < 2) throw new HttpError(400, 'Please enter the shelter name.');
  if (!s.suburb) throw new HttpError(400, 'Please enter the suburb.');
  if (s.email && !isEmail(s.email)) throw new HttpError(400, 'Please enter a valid shelter email.');
  return s;
};

router.get('/shelters', asyncHandler(async (req, res) => {
  const [shelters, pets, users] = await Promise.all([db.find('shelters'), db.find('pets'), db.find('users')]);
  res.json({ shelters: shelters.map((s) => ({ ...s, pets: pets.filter((p) => p.shelterId === s.id && ['Available', 'On Hold'].includes(p.status)).length,
    staff: users.filter((u) => u.shelterId === s.id && u.role === 'staff').length })) });
}));

router.post('/shelters', asyncHandler(async (req, res) => {
  const shelter = { id: newId('shelter'), ...readShelter(req.body), createdAt: now() };
  await db.insert('shelters', shelter);
  res.status(201).json({ shelter, message: `${shelter.name} was added.` });
}));

router.put('/shelters/:id', asyncHandler(async (req, res) => {
  const existing = await db.findOne('shelters', { id: req.params.id });
  if (!existing) throw new HttpError(404, 'Shelter not found.');
  const shelter = await db.update('shelters', existing.id, readShelter(req.body));
  res.json({ shelter, message: 'Shelter saved.' });
}));

module.exports = router;
