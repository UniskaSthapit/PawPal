// Start-up account safety:
// 1. ADMIN_EMAIL becomes an administrator. If the account doesn't exist yet it is created and emailed a
//    single-use link (valid 24 hours) to choose a password — no password is ever set in configuration.
// 2. In production, demo accounts that still use their published demo passwords are deactivated,
//    so the credentials printed in the README can never be used on a live site.
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const { emails } = require('./mailer');
const { newId, now, randomToken, hashToken, isEmail } = require('../utils');

const DEMO_ACCOUNTS = [['admin@pawpal.com', 'Admin@123'], ['staff@pawpal.com', 'Staff@123'], ['user@pawpal.com', 'User@123']];

async function ensureOwnerAdmin(email = config.adminEmail) {
  if (!email) return null;
  if (!isEmail(email)) { console.warn(`⚠️  ADMIN_EMAIL "${email}" is not a valid email address — ignored.`); return null; }
  const existing = await db.findOne('users', { email });
  if (existing) {
    if (existing.role === 'admin' && existing.active !== false) return { status: 'ok', user: existing };
    const user = await db.update('users', existing.id, { role: 'admin', active: true, emailVerified: true, tokenVersion: (existing.tokenVersion || 0) + 1 });
    return { status: 'promoted', user };
  }
  const token = randomToken();
  const user = { id: newId('user'), name: 'PawPal Administrator', email, role: 'admin', shelterId: null,
    passwordHash: await bcrypt.hash(randomToken(), 10), emailVerified: true, tokenVersion: 0, active: true,
    resetTokenHash: hashToken(token), resetTokenExpires: Date.now() + 24 * 60 * 60 * 1000, createdAt: now() };
  await db.insert('users', user);
  const mail = await emails.ownerSetup(user, `${config.appUrl}/reset-password.html?token=${token}`);
  return { status: 'created', user, emailed: mail.status === 'sent' };
}

async function disableDemoAccountsInProduction() {
  if (!config.isProd) return [];
  const disabled = [];
  for (const [email, password] of DEMO_ACCOUNTS) {
    if (email === config.adminEmail) continue;
    const u = await db.findOne('users', { email });
    if (u && u.active !== false && await bcrypt.compare(password, u.passwordHash)) {
      await db.update('users', u.id, { active: false, tokenVersion: (u.tokenVersion || 0) + 1 });
      disabled.push(email);
    }
  }
  return disabled;
}

module.exports = { ensureOwnerAdmin, disableDemoAccountsInProduction, DEMO_ACCOUNTS };
