// Database-backed favourites for adopters.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toPublic } = require('./pets');
const { newId, now, asyncHandler, clean, HttpError } = require('../utils');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const favs = (await db.find('favourites', { userId: req.user.id })).sort((a, b) => new Date(b.at) - new Date(a.at));
  const pets = await Promise.all(favs.map((f) => db.findOne('pets', { id: f.petId })));
  res.json({ ids: favs.map((f) => f.petId),
    pets: pets.filter((p) => p && p.status !== 'Draft' && p.status !== 'Archived').map(toPublic) });
}));

router.post('/:petId', asyncHandler(async (req, res) => {
  const petId = clean(req.params.petId, 40);
  const pet = await db.findOne('pets', { id: petId });
  if (!pet || !['Available', 'On Hold'].includes(pet.status)) throw new HttpError(404, 'This pet is not available to save.');
  const existing = await db.findOne('favourites', { userId: req.user.id, petId });
  if (!existing) await db.insert('favourites', { id: newId('fav'), userId: req.user.id, petId, at: now() });
  res.status(existing ? 200 : 201).json({ saved: true, message: `${pet.name} saved to your favourites.` });
}));

// Merge favourites saved in the browser before logging in
router.post('/', asyncHandler(async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map((x) => clean(String(x), 40)).slice(0, 50);
  let added = 0;
  for (const petId of ids) {
    const pet = await db.findOne('pets', { id: petId });
    if (pet && ['Available', 'On Hold'].includes(pet.status) && !(await db.findOne('favourites', { userId: req.user.id, petId }))) {
      await db.insert('favourites', { id: newId('fav'), userId: req.user.id, petId, at: now() });
      added++;
    }
  }
  res.json({ added });
}));

router.delete('/:petId', asyncHandler(async (req, res) => {
  await db.removeWhere('favourites', { userId: req.user.id, petId: clean(req.params.petId, 40) });
  res.json({ saved: false, message: 'Removed from your favourites.' });
}));

module.exports = router;
