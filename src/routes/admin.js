// Administrator: manage users (roles, shelter assignment, access) and shelters.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { emails } = require('../services/mailer');
const { requireAdmin, publicUser } = require('../middleware/auth');
const { ROLES, ROLE_LABELS } = require('../constants');
const { newId, now, asyncHandler, clean, isEmail, toBool, HttpError } = require('../utils');

const router = express.Router();
router.use(requireAdmin);

// ---- Users ----
router.get('/users', asyncHandler(async (req, res) => {
  let users = await db.find('users');
  if (req.query.role) users = users.filter((u) => u.role === req.query.role);
  const q = clean(req.query.q, 80).toLowerCase();
  if (q) users = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
  const apps = await db.find('applications');
  users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ users: users.map((u) => ({ ...publicUser(u), active: u.active !== false, lastLoginAt: u.lastLoginAt || null,
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
  const tempPassword = 'Paw' + crypto.randomBytes(5).toString('hex') + '9';
  const user = { id: newId('user'), name, email, passwordHash: await bcrypt.hash(tempPassword, 10), role, shelterId,
    emailVerified: true, tokenVersion: 0, active: true, createdAt: now() };
  await db.insert('users', user);
  await emails.staffInvite(user, tempPassword, ROLE_LABELS[role].toLowerCase());
  res.status(201).json({ user: publicUser(user), message: `${name} was added and emailed their login details.` });
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
