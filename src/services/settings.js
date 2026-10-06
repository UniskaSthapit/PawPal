// Site-wide settings changed by administrators (stored in the "settings" collection, cached in memory).
const db = require('../db');
const { now } = require('../utils');

const DEFAULTS = { requireStaff2fa: false };
let cache = null;

async function getSettings() {
  if (!cache) {
    const doc = await db.findOne('settings', { id: 'site' });
    cache = { ...DEFAULTS, ...(doc || {}) };
  }
  return cache;
}

async function updateSettings(patch, by) {
  const current = await getSettings();
  const next = { ...current, ...patch, id: 'site', updatedAt: now(), updatedBy: by || null };
  if (await db.findOne('settings', { id: 'site' })) await db.update('settings', 'site', next);
  else await db.insert('settings', next);
  cache = next;
  return next;
}

// Synchronous read for middleware (loaded once at start-up; falls back to the defaults)
const settingsNow = () => cache || DEFAULTS;
const resetSettingsCache = () => { cache = null; };

module.exports = { getSettings, updateSettings, settingsNow, resetSettingsCache, DEFAULTS };
