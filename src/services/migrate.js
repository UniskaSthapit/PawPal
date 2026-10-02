// One-time data upgrades so an existing PawPal database (e.g. the live MongoDB) keeps working
// after the workflow, roles and shelters were added. Safe to run on every start: it is versioned and idempotent.
const db = require('../db');
const { LEGACY_APP_STATUS, LEGACY_PET_STATUS } = require('../constants');
const { newId, now } = require('../utils');
const config = require('../config');
const { EXTRA_PETS } = require('./extra-pets');

// v3: real contact email on shelters, and reptiles, birds, fish, hamsters and farm animals added to the catalogue
const SCHEMA_VERSION = 3;

const DEFAULT_SHELTERS = [
  { key: 'VIC', name: 'PawPal Melbourne Rescue Centre', suburb: 'Footscray', state: 'VIC', address: '14 Hopkins Street, Footscray VIC 3011',
    phone: '(03) 9000 4120', email: config.contactEmail, hours: 'Tue–Sun 10am–5pm', about: 'Our largest centre, caring for dogs, cats and small animals from across Melbourne\'s west.' },
  { key: 'NSW', name: 'PawPal Sydney Adoption Centre', suburb: 'Parramatta', state: 'NSW', address: '80 Church Street, Parramatta NSW 2150',
    phone: '(02) 9000 7730', email: config.contactEmail, hours: 'Wed–Sun 10am–4pm', about: 'A foster-based centre working with volunteer carers across Greater Sydney.' },
  { key: 'QLD', name: 'PawPal Brisbane Haven', suburb: 'Woolloongabba', state: 'QLD', address: '22 Logan Road, Woolloongabba QLD 4102',
    phone: '(07) 3000 2285', email: config.contactEmail, hours: 'Tue–Sat 9am–4pm', about: 'Specialising in cats, kittens and senior pets looking for quiet homes.' },
  { key: 'WA', name: 'PawPal Perth Rehoming Centre', suburb: 'Osborne Park', state: 'WA', address: '5 Hutton Street, Osborne Park WA 6017',
    phone: '(08) 9000 6641', email: config.contactEmail, hours: 'Thu–Sun 10am–4pm', about: 'A small team rehoming dogs and rabbits across Perth.' },
];

async function ensureShelters() {
  const existing = await db.find('shelters');
  if (existing.length) return existing;
  const created = [];
  for (const { key, ...s } of DEFAULT_SHELTERS) {
    const shelter = { id: newId('shelter'), ...s, createdAt: now() };
    await db.insert('shelters', shelter);
    created.push(shelter);
  }
  return created;
}

// Pick the shelter in the same state as a pet's location
function shelterFor(location, shelters) {
  const state = (String(location || '').match(/\b(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\b/i) || [])[1];
  return (state && shelters.find((s) => s.state === state.toUpperCase())) || shelters[0];
}

async function migrate() {
  const meta = await db.findOne('meta', { id: 'schema' });
  if (meta && meta.version >= SCHEMA_VERSION) return false;

  const shelters = await ensureShelters();

  for (const pet of await db.find('pets')) {
    const patch = {};
    if (!pet.shelterId) patch.shelterId = shelterFor(pet.location, shelters).id;
    if (LEGACY_PET_STATUS[pet.status]) patch.status = LEGACY_PET_STATUS[pet.status];
    // Move inline base64 photos into the images collection so pet lists stay light
    if ((pet.photos || []).some((p) => p.startsWith('data:'))) {
      const { storeDataUrl } = require('../routes/images');
      patch.photos = [];
      for (const p of pet.photos) patch.photos.push(p.startsWith('data:') ? await storeDataUrl(p).catch(() => null) : p);
      patch.photos = patch.photos.filter(Boolean);
    }
    if (Object.keys(patch).length) await db.update('pets', pet.id, patch);
  }

  const pets = new Map((await db.find('pets')).map((p) => [p.id, p]));
  for (const app of await db.find('applications')) {
    const patch = {};
    if (LEGACY_APP_STATUS[app.status]) patch.status = LEGACY_APP_STATUS[app.status];
    if ((app.history || []).some((h) => LEGACY_APP_STATUS[h.status])) {
      patch.history = app.history.map((h) => ({ ...h, status: LEGACY_APP_STATUS[h.status] || h.status }));
    }
    if (app.appointmentAt === undefined) patch.appointmentAt = app.visitAt || null;
    if (!app.messages) patch.messages = [];
    if (!app.shelterId) patch.shelterId = pets.get(app.petId)?.shelterId || shelters[0].id;
    if (Object.keys(patch).length) await db.update('applications', app.id, patch);
  }

  const users = await db.find('users');
  if (!users.some((u) => u.role === 'admin')) {
    const first = users.find((u) => u.email === 'admin@pawpal.com') || users.filter((u) => u.role === 'staff').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    if (first) await db.update('users', first.id, { role: 'admin' });
  }
  for (const u of await db.find('users', { role: 'staff' })) {
    if (!u.shelterId) await db.update('users', u.id, { shelterId: shelters[0].id });
  }

  // v3 — the original demo shelter addresses (@pawpal.app) can't receive mail; point them at the real contact address
  for (const s of shelters) {
    if (/@pawpal\.app$/i.test(s.email || '')) await db.update('shelters', s.id, { email: config.contactEmail });
  }
  await addExtraPets(shelters);

  if (meta) await db.update('meta', 'schema', { version: SCHEMA_VERSION, at: now() });
  else await db.insert('meta', { id: 'schema', version: SCHEMA_VERSION, at: now() });
  return true;
}

// Adds any of the new species that aren't in the catalogue yet (matched by name + breed, so it never duplicates)
async function addExtraPets(shelters, { createdBy = null } = {}) {
  const existing = new Set((await db.find('pets')).map((p) => `${p.name}|${p.breed}`.toLowerCase()));
  const { templateDescription } = require('./ai');
  let added = 0;
  for (const [i, p] of EXTRA_PETS.entries()) {
    if (existing.has(`${p.name}|${p.breed}`.toLowerCase())) continue;
    const at = new Date(Date.now() - (i + 1) * 36e5 * 20).toISOString(); // spread over recent days
    await db.insert('pets', { id: newId('pet'), ...p, description: p.description || templateDescription(p), status: 'Available',
      shelterId: shelterFor(p.location, shelters).id, medicalHistory: 'Health check completed on intake. See care notes.', rescueBackground: 'Surrendered to the shelter.',
      internalNotes: '', createdBy, createdAt: at, updatedAt: at });
    added++;
  }
  return added;
}

module.exports = { migrate, addExtraPets, DEFAULT_SHELTERS, SCHEMA_VERSION, ensureShelters, shelterFor };
