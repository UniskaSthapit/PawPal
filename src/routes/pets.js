// Pets: public browsing/search (FR-04) + staff CRUD (FR-01). Private fields hidden from public (FR-03).
const express = require('express');
const db = require('../db');
const { requireStaff } = require('../middleware/auth');
const { newId, now, asyncHandler, clean, toBool, toInt, HttpError } = require('../utils');

const router = express.Router();

const TYPES = ['Dog', 'Cat', 'Rabbit', 'Bird', 'Other'];
const SIZES = ['Small', 'Medium', 'Large'];
const STATUSES = ['Available', 'Pending Adoption', 'Adopted', 'Draft'];
const PRIVATE_FIELDS = ['medicalHistory', 'rescueBackground', 'createdBy'];

// FR-03 — remove staff-only fields before sending to the public
const toPublic = (pet) => {
  const copy = { ...pet };
  PRIVATE_FIELDS.forEach((f) => delete copy[f]);
  return copy;
};
const isStaff = (req) => req.user?.role === 'staff';

function readPetInput(body, existing = {}) {
  const pet = {};
  const pick = (key, fn) => { if (body[key] !== undefined) pet[key] = fn(body[key]); };
  pick('name', (v) => clean(v, 40));
  pick('type', (v) => (TYPES.includes(v) ? v : 'Other'));
  pick('breed', (v) => clean(v, 60));
  pick('age', (v) => toInt(v, 0, 30, 1));
  pick('gender', (v) => (['Male', 'Female'].includes(v) ? v : 'Unknown'));
  pick('size', (v) => (SIZES.includes(v) ? v : 'Medium'));
  pick('location', (v) => clean(v, 80));
  pick('traits', (v) => (Array.isArray(v) ? v : String(v).split(',')).map((t) => clean(String(t), 30)).filter(Boolean).slice(0, 10));
  pick('energyLevel', (v) => toInt(v, 1, 3, 2));
  ['requiresYard', 'goodWithChildren', 'goodWithOtherPets', 'vaccinated', 'desexed', 'microchipped'].forEach((k) => pick(k, toBool));
  pick('description', (v) => clean(v, 2000));
  pick('medicalHistory', (v) => clean(v, 2000));
  pick('rescueBackground', (v) => clean(v, 2000));
  pick('status', (v) => (STATUSES.includes(v) ? v : 'Available'));
  pick('photos', (v) => (Array.isArray(v) ? v : [])
    .filter((u) => typeof u === 'string' && (/^https:\/\//.test(u) || /^data:image\/(jpeg|png|webp);base64,/.test(u)))
    .filter((u) => u.length < 1_600_000).slice(0, 8));

  const merged = { ...existing, ...pet };
  if (!merged.name) throw new HttpError(400, 'Please enter the pet\'s name.');
  if (!merged.type) throw new HttpError(400, 'Please choose the type of pet.');
  if (!merged.breed) throw new HttpError(400, 'Please enter the breed (or "Mixed").');
  return pet;
}

function sortPets(list, sort) {
  const by = {
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    name: (a, b) => a.name.localeCompare(b.name),
    youngest: (a, b) => a.age - b.age,
  }[sort] || ((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list.sort(by);
}

// ---- List + keyword search (FR-04) ----
router.get('/', asyncHandler(async (req, res) => {
  const staffView = isStaff(req) && req.query.all === '1';
  let pets = await db.find('pets');
  if (!staffView) pets = pets.filter((p) => p.status === 'Available' || p.status === 'Pending Adoption');
  if (req.query.status) pets = pets.filter((p) => p.status === req.query.status);

  const type = clean(req.query.type, 20).toLowerCase();
  if (type === 'other') pets = pets.filter((p) => !['Dog', 'Cat'].includes(p.type));
  else if (type) pets = pets.filter((p) => p.type.toLowerCase() === type);

  const traits = clean(req.query.traits, 200).toLowerCase().split(',').filter(Boolean);
  if (traits.length) pets = pets.filter((p) => traits.every((t) => (p.traits || []).some((x) => x.toLowerCase().includes(t))));

  const q = clean(req.query.q, 80).toLowerCase();
  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    pets = pets
      .map((p) => {
        const hay = [p.name, p.type, p.breed, p.size, p.location, p.gender, ...(p.traits || [])].join(' ').toLowerCase();
        const hits = words.filter((w) => hay.includes(w) || (w.endsWith('s') && hay.includes(w.slice(0, -1)))).length;
        return { p, hits };
      })
      .filter((x) => x.hits === words.length)
      .map((x) => x.p);
    // Log real searches for analytics (FR-06). Staff searches are not counted.
    if (req.query.log === '1' && !isStaff(req)) {
      await db.insert('searches', { id: newId('srch'), keyword: q, results: pets.length, at: now() });
    }
  }

  pets = sortPets(pets, req.query.sort);
  res.json({ pets: staffView ? pets : pets.map(toPublic), total: pets.length });
}));

// ---- Single pet ----
router.get('/:id', asyncHandler(async (req, res) => {
  const pet = await db.findOne('pets', { id: req.params.id });
  if (!pet || (pet.status === 'Draft' && !isStaff(req))) throw new HttpError(404, 'This pet could not be found. They may have been adopted.');
  if (isStaff(req)) {
    const apps = await db.find('applications', { petId: pet.id });
    return res.json({ pet, applicationCount: apps.length });
  }
  res.json({ pet: toPublic(pet) });
}));

// ---- Staff: create / update / delete (FR-01) ----
router.post('/', requireStaff, asyncHandler(async (req, res) => {
  const input = readPetInput(req.body);
  const pet = { id: newId('pet'), traits: [], photos: [], energyLevel: 2, requiresYard: false, goodWithChildren: true,
    goodWithOtherPets: true, vaccinated: false, desexed: false, microchipped: false, status: 'Available', age: 1,
    gender: 'Unknown', size: 'Medium', location: '', description: '', medicalHistory: '', rescueBackground: '',
    ...input, createdBy: req.user.id, createdAt: now(), updatedAt: now() };
  await db.insert('pets', pet);
  res.status(201).json({ pet, message: pet.status === 'Draft' ? 'Draft saved.' : `${pet.name} is now live on PawPal.` });
}));

router.put('/:id', requireStaff, asyncHandler(async (req, res) => {
  const existing = await db.findOne('pets', { id: req.params.id });
  if (!existing) throw new HttpError(404, 'Pet not found.');
  const input = readPetInput(req.body, existing);
  const pet = await db.update('pets', existing.id, { ...input, updatedAt: now() });
  res.json({ pet, message: 'Changes saved.' });
}));

router.delete('/:id', requireStaff, asyncHandler(async (req, res) => {
  const pet = await db.findOne('pets', { id: req.params.id });
  if (!pet) throw new HttpError(404, 'Pet not found.');
  await db.remove('pets', pet.id);
  res.json({ message: `${pet.name} was removed.` });
}));

module.exports = router;
module.exports.toPublic = toPublic;
