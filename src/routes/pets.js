// Pets: public discovery (search + filters) and staff management.
// Internal fields (medical history, rescue background, staff notes) never leave the server for the public.
const express = require('express');
const db = require('../db');
const { requireStaff, isStaff, shelterScope, inScope } = require('../middleware/auth');
const { PET_TYPES, PET_SIZES, PET_STATUSES, PUBLIC_PET_STATUSES } = require('../constants');
const { notify } = require('../services/notify');
const { storeDataUrl } = require('./images');
const { newId, now, asyncHandler, clean, toBool, toInt, HttpError } = require('../utils');

const router = express.Router();

const PRIVATE_FIELDS = ['medicalHistory', 'rescueBackground', 'internalNotes', 'createdBy'];

const toPublic = (pet) => {
  const copy = { ...pet };
  PRIVATE_FIELDS.forEach((f) => delete copy[f]);
  return copy;
};

const publicShelter = (s) => s && ({ id: s.id, name: s.name, suburb: s.suburb, state: s.state, address: s.address,
  phone: s.phone, email: s.email, hours: s.hours, about: s.about });

// Age bands used by the filters
const AGE_BANDS = { baby: [0, 0], young: [1, 2], adult: [3, 7], senior: [8, 40] };

async function readPetInput(body, existing = {}) {
  const pet = {};
  const pick = (key, fn) => { if (body[key] !== undefined) pet[key] = fn(body[key]); };
  pick('name', (v) => clean(v, 40));
  pick('type', (v) => (PET_TYPES.includes(v) ? v : 'Other'));
  pick('breed', (v) => clean(v, 60));
  pick('age', (v) => toInt(v, 0, 30, 1));
  pick('ageMonths', (v) => toInt(v, 0, 11, 0));
  pick('gender', (v) => (['Male', 'Female'].includes(v) ? v : 'Unknown'));
  pick('size', (v) => (PET_SIZES.includes(v) ? v : 'Medium'));
  pick('colour', (v) => clean(v, 40));
  pick('location', (v) => clean(v, 80));
  pick('traits', (v) => (Array.isArray(v) ? v : String(v).split(',')).map((t) => clean(String(t), 30)).filter(Boolean).slice(0, 10));
  pick('energyLevel', (v) => toInt(v, 1, 3, 2));
  ['requiresYard', 'goodWithChildren', 'goodWithOtherPets', 'goodWithCats', 'vaccinated', 'desexed', 'microchipped',
    'firstTimeFriendly', 'specialNeeds'].forEach((k) => pick(k, toBool));
  pick('adoptionFee', (v) => toInt(v, 0, 5000, 0));
  pick('description', (v) => clean(v, 2500));
  pick('idealHome', (v) => clean(v, 600));
  pick('medicalHistory', (v) => clean(v, 2000));
  pick('rescueBackground', (v) => clean(v, 2000));
  pick('internalNotes', (v) => clean(v, 2000));
  pick('status', (v) => (PET_STATUSES.includes(v) ? v : 'Available'));
  if (body.photos !== undefined) {
    const list = (Array.isArray(body.photos) ? body.photos : []).filter((u) => typeof u === 'string').slice(0, 8);
    const out = [];
    for (const u of list) {
      if (/^https:\/\/\S+$/.test(u) || /^\/api\/images\/[\w-]+$/.test(u)) out.push(u);
      else if (/^data:image\/(jpeg|png|webp);base64,/.test(u) && u.length < 1_600_000) out.push(await storeDataUrl(u));
    }
    pet.photos = out;
  }

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
    oldestAge: (a, b) => b.age - a.age,
    longestStay: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  }[sort] || ((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list.sort(by);
}

const matchesType = (pet, type) => {
  if (!type) return true;
  if (type === 'other') return !['Dog', 'Cat'].includes(pet.type);
  return pet.type.toLowerCase() === type;
};

// Shared filter used by search, AI search and the chatbot so everything agrees on the same data
function applyFilters(pets, f) {
  return pets.filter((p) => {
    if (f.type && !matchesType(p, f.type)) return false;
    if (f.breed && !p.breed.toLowerCase().includes(f.breed)) return false;
    if (f.gender && p.gender.toLowerCase() !== f.gender) return false;
    if (f.size?.length && !f.size.includes(p.size.toLowerCase())) return false;
    if (f.age?.length && !f.age.some((band) => AGE_BANDS[band] && p.age >= AGE_BANDS[band][0] && p.age <= AGE_BANDS[band][1])) return false;
    if (f.energy?.length && !f.energy.includes(Number(p.energyLevel))) return false;
    if (f.location && !`${p.location}`.toLowerCase().includes(f.location)) return false;
    if (f.apartment && p.requiresYard) return false;
    if (f.kids && !p.goodWithChildren) return false;
    if (f.otherPets && !p.goodWithOtherPets) return false;
    if (f.firstTime && !(p.firstTimeFriendly || (p.energyLevel <= 2 && p.goodWithChildren))) return false;
    if (f.shelterId && p.shelterId !== f.shelterId) return false;
    if (f.traits?.length && !f.traits.every((t) => (p.traits || []).some((x) => x.toLowerCase().includes(t)))) return false;
    return true;
  });
}

function keywordFilter(pets, q) {
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return pets;
  return pets.filter((p) => {
    const hay = [p.name, p.type, p.breed, p.size, p.location, p.gender, p.colour, ...(p.traits || [])].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w) || (w.endsWith('s') && hay.includes(w.slice(0, -1))));
  });
}

const csv = (v) => clean(v, 200).toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
function readFilters(q) {
  return {
    type: clean(q.type, 20).toLowerCase(),
    breed: clean(q.breed, 60).toLowerCase(),
    gender: clean(q.gender, 10).toLowerCase(),
    size: csv(q.size),
    age: csv(q.age),
    energy: csv(q.energy).map(Number).filter((n) => n >= 1 && n <= 3),
    location: clean(q.location, 60).toLowerCase(),
    apartment: toBool(q.apartment),
    kids: toBool(q.kids),
    otherPets: toBool(q.otherPets),
    firstTime: toBool(q.firstTime),
    shelterId: clean(q.shelterId, 40),
    traits: csv(q.traits),
  };
}

async function publicPets() {
  return (await db.find('pets')).filter((p) => PUBLIC_PET_STATUSES.includes(p.status));
}

// ---- Filter options (breeds, locations) built from the live data ----
router.get('/facets', asyncHandler(async (req, res) => {
  const pets = await publicPets();
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  res.json({ breeds: uniq(pets.map((p) => p.breed)), locations: uniq(pets.map((p) => p.location)),
    types: uniq(pets.map((p) => p.type)), total: pets.length });
}));

// ---- List + search ----
router.get('/', asyncHandler(async (req, res) => {
  const staffView = isStaff(req) && req.query.all === '1';
  let pets = await db.find('pets');
  if (staffView) {
    const scope = shelterScope(req);
    if (scope) pets = pets.filter((p) => p.shelterId === scope);
    if (req.query.status) pets = pets.filter((p) => p.status === req.query.status);
  } else {
    pets = pets.filter((p) => PUBLIC_PET_STATUSES.includes(p.status));
    if (req.query.available === '1') pets = pets.filter((p) => p.status === 'Available');
  }
  pets = applyFilters(pets, readFilters(req.query));

  const q = clean(req.query.q, 80).toLowerCase();
  if (q) {
    pets = keywordFilter(pets, q);
    if (req.query.log === '1' && !isStaff(req)) {
      await db.insert('searches', { id: newId('srch'), keyword: q, results: pets.length, at: now() });
    }
  }

  pets = sortPets(pets, req.query.sort);
  const total = pets.length;
  const limit = toInt(req.query.limit, 1, 200, 200);
  const offset = toInt(req.query.offset, 0, 10000, 0);
  pets = pets.slice(offset, offset + limit);
  res.json({ pets: staffView ? pets : pets.map(toPublic), total });
}));

// ---- Single pet ----
router.get('/:id', asyncHandler(async (req, res) => {
  const pet = await db.findOne('pets', { id: req.params.id });
  const staff = isStaff(req) && pet && inScope(req, pet);
  if (!pet || (!PUBLIC_PET_STATUSES.includes(pet.status) && !staff && pet.status !== 'Adopted')) {
    throw new HttpError(404, 'This pet could not be found. They may have found their home already.');
  }
  const shelter = pet.shelterId ? await db.findOne('shelters', { id: pet.shelterId }) : null;
  if (staff) {
    const [apps, enquiries, favs] = await Promise.all([db.find('applications', { petId: pet.id }),
      db.find('enquiries', { petId: pet.id }), db.count('favourites', { petId: pet.id })]);
    return res.json({ pet, shelter: publicShelter(shelter), applicationCount: apps.length, enquiryCount: enquiries.length, favouriteCount: favs });
  }
  if (req.query.view === '1') await db.insert('events', { id: newId('evt'), type: 'pet_view', petId: pet.id, shelterId: pet.shelterId || null, at: now() });
  res.json({ pet: toPublic(pet), shelter: publicShelter(shelter) });
}));

// Tell people who saved a pet when it stops being available
async function notifyFavouritersUnavailable(pet, reason) {
  const favs = await db.find('favourites', { petId: pet.id });
  await Promise.all(favs.map((f) => notify(f.userId, { type: 'pet', title: `${pet.name} is no longer available`,
    message: reason === 'Adopted' ? `${pet.name} has found a home. PawPal can suggest similar pets for you.`
      : `${pet.name} has been taken off the adoption list.`, link: 'ai-matching.html' })));
}

// ---- Staff: create / update / delete ----
router.post('/', requireStaff, asyncHandler(async (req, res) => {
  const input = await readPetInput(req.body);
  const shelterId = req.user.role === 'admin' ? clean(req.body.shelterId, 40) || req.user.shelterId || null : req.user.shelterId || null;
  const shelter = shelterId ? await db.findOne('shelters', { id: shelterId }) : null;
  const pet = { id: newId('pet'), traits: [], photos: [], energyLevel: 2, requiresYard: false, goodWithChildren: true,
    goodWithOtherPets: true, vaccinated: false, desexed: false, microchipped: false, status: 'Available', age: 1,
    gender: 'Unknown', size: 'Medium', location: shelter ? `${shelter.suburb}, ${shelter.state}` : '', description: '',
    medicalHistory: '', rescueBackground: '', internalNotes: '', adoptionFee: 0,
    ...input, shelterId, createdBy: req.user.id, createdAt: now(), updatedAt: now() };
  await db.insert('pets', pet);
  if (pet.status === 'Available') require('../services/matching').notifyNewMatches(pet).catch((e) => console.warn('Match notify failed:', e.message));
  res.status(201).json({ pet, message: pet.status === 'Draft' ? 'Draft saved.' : `${pet.name} is now live on PawPal.` });
}));

router.put('/:id', requireStaff, asyncHandler(async (req, res) => {
  const existing = await db.findOne('pets', { id: req.params.id });
  if (!existing || !inScope(req, existing)) throw new HttpError(404, 'Pet not found.');
  const input = await readPetInput(req.body, existing);
  if (req.user.role === 'admin' && req.body.shelterId !== undefined) input.shelterId = clean(req.body.shelterId, 40) || null;
  const statusChanged = input.status && input.status !== existing.status;
  if (statusChanged && input.status === 'Adopted') input.adoptedAt = now();
  if (statusChanged && input.status === 'Archived') input.archivedAt = now();
  const pet = await db.update('pets', existing.id, { ...input, updatedAt: now() });
  if (statusChanged) {
    const wasPublic = ['Available', 'On Hold'].includes(existing.status);
    if (wasPublic && ['Adopted', 'Archived'].includes(pet.status)) await notifyFavouritersUnavailable(pet, pet.status);
    if (pet.status === 'Available' && ['Draft', 'Archived'].includes(existing.status)) {
      require('../services/matching').notifyNewMatches(pet).catch((e) => console.warn('Match notify failed:', e.message));
    }
  }
  const message = statusChanged ? { Archived: `${pet.name} was archived.`, Adopted: `${pet.name} is marked as adopted.`,
    Available: `${pet.name} is live on PawPal.`, Draft: `${pet.name} was moved to drafts.`, 'On Hold': `${pet.name} is on hold.` }[pet.status] : 'Changes saved.';
  res.json({ pet, message });
}));

router.delete('/:id', requireStaff, asyncHandler(async (req, res) => {
  const pet = await db.findOne('pets', { id: req.params.id });
  if (!pet || !inScope(req, pet)) throw new HttpError(404, 'Pet not found.');
  const apps = await db.count('applications', { petId: pet.id });
  if (apps > 0) throw new HttpError(409, `${pet.name} has adoption applications on record, so the profile can't be deleted. Archive it instead.`);
  await db.remove('pets', pet.id);
  await db.removeWhere('favourites', { petId: pet.id });
  res.json({ message: `${pet.name} was deleted.` });
}));

module.exports = router;
Object.assign(module.exports, { toPublic, publicShelter, applyFilters, keywordFilter, publicPets, AGE_BANDS });
