// Uploaded pet photos. Stored once in the "images" collection and served by URL,
// so pet lists stay small instead of carrying megabytes of base64 in every response.
const express = require('express');
const db = require('../db');
const { requireStaff } = require('../middleware/auth');
const { newId, now, asyncHandler, HttpError } = require('../utils');

const router = express.Router();
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

async function storeDataUrl(dataUrl) {
  const m = DATA_URL.exec(dataUrl);
  if (!m) throw new HttpError(400, 'Photos must be JPG, PNG or WebP images.');
  if (m[2].length > 1_600_000) throw new HttpError(413, 'That photo is too large.');
  const id = newId('img');
  await db.insert('images', { id, contentType: m[1], data: m[2], createdAt: now() });
  return `/api/images/${id}`;
}

router.post('/', requireStaff, asyncHandler(async (req, res) => {
  res.status(201).json({ url: await storeDataUrl(String(req.body?.data || '')) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const img = await db.findOne('images', { id: req.params.id });
  if (!img) throw new HttpError(404, 'Image not found.');
  res.setHeader('Content-Type', img.contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(img.data, 'base64'));
}));

module.exports = router;
module.exports.storeDataUrl = storeDataUrl;
