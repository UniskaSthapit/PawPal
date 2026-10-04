// Two-factor authentication (TOTP, RFC 6238) using only Node's built-in crypto.
// 30-second time step, 6 digits, HMAC-SHA1 (what every authenticator app supports), ±1 step tolerance.
// Secrets are stored encrypted (AES-256-GCM, key derived from JWT_SECRET); backup codes only as bcrypt hashes.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');

const STEP = 30;
const DIGITS = 6;
const WINDOW = 1;
const ISSUER = 'PawPal';

// ---- Base32 (RFC 4648, no padding) — the format authenticator apps expect ----
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const generateSecret = () => base32Encode(crypto.randomBytes(20)); // 160-bit secret, as RFC 4226 recommends

// HOTP (RFC 4226) for one counter value
function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

const timeStep = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);
const totp = (secret, ms = Date.now()) => hotp(secret, timeStep(ms));

// Returns the matching time step (so the caller can refuse to accept the same code twice), or null
function verifyTotp(secret, code, { ms = Date.now(), lastStep = -1 } = {}) {
  const digits = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const now = timeStep(ms);
  for (let step = now - WINDOW; step <= now + WINDOW; step++) {
    if (step <= lastStep) continue; // already used — replay protection
    const expected = hotp(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(digits))) return step;
  }
  return null;
}

// otpauth:// link that authenticator apps read from the QR code
const otpauthUrl = (secret, account) => `otpauth://totp/${encodeURIComponent(`${ISSUER}:${account}`)}?secret=${secret}`
  + `&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;

// ---- Secret encryption at rest: AES-256-GCM with a key derived from JWT_SECRET ----
const KEY = Buffer.from(crypto.hkdfSync('sha256', config.jwtSecret, 'pawpal-2fa', 'totp-secret-encryption', 32));
function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}
function decryptSecret(stored) {
  const [version, iv, tag, data] = String(stored || '').split(':');
  if (version !== 'v1') throw new Error('Unknown 2FA secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// ---- One-time backup codes: shown once, stored only as bcrypt hashes ----
const BACKUP_COUNT = 8;
function generateBackupCodes() {
  return Array.from({ length: BACKUP_COUNT }, () => {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 hex characters
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
const normaliseBackup = (code) => String(code || '').toLowerCase().replace(/[^0-9a-f]/g, '');
const hashBackupCodes = (codes) => Promise.all(codes.map((c) => bcrypt.hash(normaliseBackup(c), 10)));
// Returns the index of the matching (unused) hash, or -1
async function matchBackupCode(hashes = [], code) {
  const norm = normaliseBackup(code);
  if (norm.length !== 10) return -1;
  for (let i = 0; i < hashes.length; i++) {
    if (hashes[i] && await bcrypt.compare(norm, hashes[i])) return i;
  }
  return -1;
}

module.exports = { generateSecret, totp, hotp, verifyTotp, otpauthUrl, encryptSecret, decryptSecret, generateBackupCodes,
  hashBackupCodes, matchBackupCode, base32Encode, base32Decode, timeStep, STEP };
