// Small shared helpers used across routes and services.
const crypto = require('crypto');

const newId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
const now = () => new Date().toISOString();
const randomToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Error type that routes can throw to send a clean status + message
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Wrap async route handlers so thrown errors reach the error middleware
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Trim strings and cap their length so no field can be abused
const clean = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const toBool = (v) => v === true || v === 'true' || v === 'yes' || v === 1 || v === '1';
const toInt = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isEmail = (v) => EMAIL_RE.test(String(v || '').trim());

// At least 8 characters with at least one letter and one number
const passwordProblem = (pw) => {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must include at least one letter and one number.';
  return null;
};

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { newId, now, randomToken, hashToken, HttpError, asyncHandler, clean, toBool, toInt,
  isEmail, passwordProblem, escapeHtml };
