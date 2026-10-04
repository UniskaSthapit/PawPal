// Authentication middleware — JWT stored in an httpOnly cookie (not readable by page scripts).
// Roles: "user" (adopter), "staff" (shelter staff, scoped to one shelter), "admin" (everything).
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

const COOKIE = 'pawpal_token';

function setAuthCookie(res, user, remember) {
  const token = jwt.sign({ sub: user.id, v: user.tokenVersion || 0 }, config.jwtSecret, { expiresIn: remember ? '30d' : config.jwtExpiresIn });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    ...(remember ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}), // session cookie unless "Remember me"
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.isProd });
}

// Attaches req.user when a valid token is present (never blocks)
async function loadUser(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await db.findOne('users', { id: payload.sub });
    // tokenVersion changes on password change → old sessions stop working
    if (user && (user.tokenVersion || 0) === payload.v && user.active !== false) req.user = user;
  } catch { /* expired or invalid token: treat as logged out */ }
  next();
}

const isStaffRole = (role) => role === 'staff' || role === 'admin';
const isStaff = (req) => isStaffRole(req.user?.role);
const isAdmin = (req) => req.user?.role === 'admin';

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

function requireAdopter(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (req.user.role !== 'user') return res.status(403).json({ error: 'This is only available to adopter accounts.' });
  next();
}

function requireStaff(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (!isStaffRole(req.user.role)) return res.status(403).json({ error: 'Staff access only.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access only.' });
  next();
}

// Staff only see their own shelter's pets, applications and enquiries. Admins see everything (null = no limit).
const shelterScope = (req) => (req.user?.role === 'admin' ? null : req.user?.shelterId || '__none__');
const inScope = (req, doc) => { const s = shelterScope(req); return s === null || doc?.shelterId === s; };

// Safe version of a user for sending to the browser
const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone || '',
  phoneVerified: !!u.phoneVerified, emailVerified: !!u.emailVerified, shelterId: u.shelterId || null,
  preferences: u.preferences || null, emailPrefs: { applications: u.emailPrefs?.applications !== false, activity: u.emailPrefs?.activity !== false },
  createdAt: u.createdAt });

module.exports = { setAuthCookie, clearAuthCookie, loadUser, requireAuth, requireAdopter, requireStaff, requireAdmin,
  isStaff, isAdmin, isStaffRole, shelterScope, inScope, publicUser };
