// Meet & greet availability: staff publish time slots for their shelter; adopters who are invited book one
// (booking itself lives in routes/applications.js so it shares the application workflow).
const express = require('express');
const db = require('../db');
const { requireStaff, shelterScope, inScope } = require('../middleware/auth');
const { newId, now, asyncHandler, clean, HttpError } = require('../utils');

const router = express.Router();
const DURATIONS = [15, 20, 30, 45, 60, 90, 120];
const DAY = 24 * 60 * 60 * 1000;
const MAX_WINDOWS = 12;
const MAX_SLOTS = 300;

const parseDate = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

// Slots with who booked them (staff only see their own shelter's)
router.get('/', requireStaff, asyncHandler(async (req, res) => {
  const from = parseDate(req.query.from) || new Date(Date.now() - DAY);
  const to = parseDate(req.query.to) || new Date(Date.now() + 90 * DAY);
  const scope = shelterScope(req);
  let slots = (await db.find('slots')).filter((s) => (!scope || s.shelterId === scope) && new Date(s.start) >= from && new Date(s.start) <= to);
  if (!scope && req.query.shelterId) slots = slots.filter((s) => s.shelterId === req.query.shelterId);
  slots.sort((a, b) => new Date(a.start) - new Date(b.start));
  const apps = new Map((await db.find('applications')).map((a) => [a.id, a]));
  res.json({ slots: slots.map((s) => {
    const a = s.bookedBy ? apps.get(s.bookedBy) : null;
    return { ...s, booking: a ? { applicationId: a.id, name: a.name, petName: a.petName, status: a.status } : null };
  }), durations: DURATIONS });
}));

// Create one slot, or a repeating series. The browser sends each day's window ({ start, end } as ISO times,
// already converted from local time — so daylight-saving changes are handled where the times were chosen)
// and the slot length; slots are generated back-to-back inside each window.
router.post('/', requireStaff, asyncHandler(async (req, res) => {
  const scope = shelterScope(req);
  const shelterId = scope || clean(req.body.shelterId, 40);
  if (!shelterId || !(await db.findOne('shelters', { id: shelterId }))) throw new HttpError(400, scope ? 'You are not assigned to a shelter yet.' : 'Choose a shelter for these times.');
  const durationMins = Number(req.body.durationMins);
  if (!DURATIONS.includes(durationMins)) throw new HttpError(400, `Slot length must be one of ${DURATIONS.join(', ')} minutes.`);
  const windows = Array.isArray(req.body.windows) ? req.body.windows : [];
  if (!windows.length || windows.length > MAX_WINDOWS) throw new HttpError(400, `Add between 1 and ${MAX_WINDOWS} days of times.`);

  const starts = [];
  for (const w of windows) {
    const start = parseDate(w?.start); const end = parseDate(w?.end);
    if (!start || !end) throw new HttpError(400, 'Each time range needs a valid start and end.');
    if (end <= start) throw new HttpError(400, 'The end time must be after the start time.');
    if (end - start > 12 * 60 * 60 * 1000) throw new HttpError(400, 'A time range can be at most 12 hours.');
    if (start.getTime() < Date.now()) throw new HttpError(400, 'Times must be in the future.');
    if (start.getTime() > Date.now() + 365 * DAY) throw new HttpError(400, 'Times can be at most a year ahead.');
    if (end - start < durationMins * 60 * 1000) throw new HttpError(400, 'The time range is shorter than one slot.');
    for (let t = start.getTime(); t + durationMins * 60 * 1000 <= end.getTime(); t += durationMins * 60 * 1000) starts.push(t);
  }
  if (starts.length > MAX_SLOTS) throw new HttpError(400, `That would create ${starts.length} slots — the most at once is ${MAX_SLOTS}.`);

  const existing = new Set((await db.find('slots', { shelterId })).map((s) => new Date(s.start).getTime()));
  let created = 0;
  for (const t of [...new Set(starts)].sort()) {
    if (existing.has(t)) continue; // already offered
    await db.insert('slots', { id: newId('slot'), shelterId, start: new Date(t).toISOString(), durationMins, bookedBy: null, createdBy: req.user.id, createdAt: now() });
    created++;
  }
  const skipped = starts.length - created;
  res.status(201).json({ created, skipped,
    message: `${created} meet & greet time${created === 1 ? '' : 's'} added.${skipped ? ` ${skipped} already existed.` : ''}` });
}));

// Only free slots can be deleted (booked ones must be cancelled by the adopter or moved by changing the status)
router.delete('/:id', requireStaff, asyncHandler(async (req, res) => {
  const slot = await db.findOne('slots', { id: req.params.id });
  if (!slot || !inScope(req, slot)) throw new HttpError(404, 'Time slot not found.');
  if (slot.bookedBy) throw new HttpError(409, 'This time is booked. Ask the adopter to change it, or update their application status.');
  await db.remove('slots', slot.id);
  res.json({ message: 'Time removed.' });
}));

module.exports = router;
Object.assign(module.exports, { DURATIONS });
