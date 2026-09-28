// Adoption applications: inquiry form (FR-07), AI suitability score (FR-08),
// status tracking (FR-09) and automatic closure notifications (FR-12).
const express = require('express');
const db = require('../db');
const { emails } = require('../services/mailer');
const { calculateSuitabilityScore, LIVING_TYPES, EXPERIENCE } = require('../services/scoring');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { newId, now, asyncHandler, clean, toBool, toInt, isEmail, HttpError, escapeHtml } = require('../utils');

const router = express.Router();

const STATUSES = ['Pending', 'Shortlisted', 'Visit Scheduled', 'Approved', 'Rejected', 'Adopted', 'Withdrawn'];
const CLOSED = ['Rejected', 'Adopted', 'Withdrawn'];

async function notify(userId, email, title, message, link = 'my-applications.html') {
  let uid = userId;
  if (!uid && email) uid = (await db.findOne('users', { email }))?.id;
  if (!uid) return;
  await db.insert('notifications', { id: newId('note'), userId: uid, title, message, link, read: false, at: now() });
}

// What adopters are allowed to see about their own application (no score / staff notes)
const forApplicant = (a) => ({ id: a.id, petId: a.petId, petName: a.petName, petBreed: a.petBreed, petPhoto: a.petPhoto,
  status: a.status, history: a.history, visitAt: a.visitAt, submittedAt: a.submittedAt, updatedAt: a.updatedAt });

// ---- FR-07: submit an inquiry ----
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role === 'staff') throw new HttpError(403, 'Staff accounts cannot submit adoption applications.');
  const b = req.body;
  const pet = await db.findOne('pets', { id: clean(b.petId, 40) });
  if (!pet || !['Available', 'Pending Adoption'].includes(pet.status)) throw new HttpError(400, 'This pet is no longer available for adoption.');

  const form = {
    name: clean(b.name, 80), email: clean(b.email, 120).toLowerCase(), phone: clean(b.phone, 30), address: clean(b.address, 160),
    livingType: LIVING_TYPES.includes(b.livingType) ? b.livingType : '',
    activityLevel: toInt(b.activityLevel, 1, 3, 0) || '',
    hoursAlone: b.hoursAlone === '' || b.hoursAlone === undefined ? '' : toInt(b.hoursAlone, 0, 24, 0),
    hasChildren: b.hasChildren === undefined || b.hasChildren === '' ? '' : toBool(b.hasChildren),
    hasOtherPets: b.hasOtherPets === undefined || b.hasOtherPets === '' ? '' : toBool(b.hasOtherPets),
    experience: EXPERIENCE.includes(b.experience) ? b.experience : '',
    experienceDetails: clean(b.experienceDetails, 1500), motivation: clean(b.motivation, 2000),
  };
  if (form.name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  if (!isEmail(form.email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (form.motivation.length < 20) throw new HttpError(400, 'Please tell us a little more about why you want to adopt (at least 20 characters).');

  const result = calculateSuitabilityScore(form, pet);
  if (result.error) throw new HttpError(400, 'Please answer every question in the Lifestyle and Home sections.');

  const existing = (await db.find('applications', { petId: pet.id, userId: req.user.id })).find((a) => !CLOSED.includes(a.status));
  if (existing) throw new HttpError(409, `You already have an open application for ${pet.name}.`);

  const app = { id: newId('app'), petId: pet.id, petName: pet.name, petBreed: pet.breed, petPhoto: pet.photos?.[0] || '',
    userId: req.user.id, ...form, score: result.score, label: result.label, breakdown: result.breakdown, notes: result.notes,
    status: 'Pending', history: [{ status: 'Pending', at: now(), by: 'Applicant' }], staffNotes: '', visitAt: null,
    submittedAt: now(), updatedAt: now() };
  await db.insert('applications', app);
  await notify(req.user.id, null, 'Application submitted', `Your application for ${pet.name} is now Pending review.`);
  emails.applicationReceived(app).catch(() => {});
  res.status(201).json({ application: forApplicant(app), message: 'Application submitted.' });
}));

// ---- Adopter: my applications ----
router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const mine = (await db.find('applications'))
    .filter((a) => a.userId === req.user.id || a.email === req.user.email)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json({ applications: mine.map(forApplicant) });
}));

router.post('/:id/withdraw', requireAuth, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!app || (app.userId !== req.user.id && app.email !== req.user.email)) throw new HttpError(404, 'Application not found.');
  if (CLOSED.includes(app.status)) throw new HttpError(400, 'This application is already closed.');
  const updated = await db.update('applications', app.id, { status: 'Withdrawn', updatedAt: now(),
    history: [...app.history, { status: 'Withdrawn', at: now(), by: 'Applicant' }] });
  await releasePetIfIdle(app.petId);
  res.json({ application: forApplicant(updated), message: 'Application withdrawn.' });
}));

// ---- Staff: list, ranked (FR-08) ----
router.get('/', requireStaff, asyncHandler(async (req, res) => {
  let apps = await db.find('applications');
  if (req.query.petId) apps = apps.filter((a) => a.petId === req.query.petId);
  if (req.query.status) apps = apps.filter((a) => a.status === req.query.status);
  const q = clean(req.query.q, 80).toLowerCase();
  if (q) apps = apps.filter((a) => `${a.name} ${a.email} ${a.petName}`.toLowerCase().includes(q));
  const sort = req.query.sort || 'newest';
  apps.sort(sort === 'score' ? (a, b) => b.score - a.score : (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  const limit = toInt(req.query.limit, 1, 500, 500);
  res.json({ applications: apps.slice(0, limit), total: apps.length, statuses: STATUSES });
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!app) throw new HttpError(404, 'Application not found.');
  if (req.user.role === 'staff') {
    // Rank of this applicant among everyone who applied for the same pet
    const rivals = (await db.find('applications', { petId: app.petId })).filter((a) => !['Withdrawn'].includes(a.status))
      .sort((a, b) => b.score - a.score);
    return res.json({ application: app, rank: rivals.findIndex((a) => a.id === app.id) + 1, totalForPet: rivals.length });
  }
  if (app.userId !== req.user.id && app.email !== req.user.email) throw new HttpError(404, 'Application not found.');
  res.json({ application: forApplicant(app) });
}));

// Put a pet back on the market when nobody is progressing with it any more
async function releasePetIfIdle(petId) {
  const pet = await db.findOne('pets', { id: petId });
  if (!pet || pet.status !== 'Pending Adoption') return;
  const active = (await db.find('applications', { petId })).some((a) => ['Visit Scheduled', 'Approved'].includes(a.status));
  if (!active) await db.update('pets', petId, { status: 'Available', updatedAt: now() });
}

// ---- Staff: change status (FR-09) with notifications (FR-12) ----
router.patch('/:id/status', requireStaff, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!app) throw new HttpError(404, 'Application not found.');
  const status = req.body.status;
  if (!STATUSES.includes(status) || status === 'Withdrawn') throw new HttpError(400, 'Please choose a valid status.');
  if (app.status === 'Adopted') throw new HttpError(400, 'This adoption is complete and can no longer be changed.');
  if (app.status === status && status !== 'Visit Scheduled') throw new HttpError(400, `This application is already ${status}.`);

  let visitAt = app.visitAt;
  if (status === 'Visit Scheduled') {
    visitAt = req.body.visitAt ? new Date(req.body.visitAt) : null;
    if (!visitAt || Number.isNaN(visitAt.getTime())) throw new HttpError(400, 'Please choose a date and time for the visit.');
    visitAt = visitAt.toISOString();
  }
  const pet = await db.findOne('pets', { id: app.petId });
  if (status === 'Adopted' && pet?.status === 'Adopted') throw new HttpError(400, `${app.petName} has already been adopted by another applicant.`);

  const note = clean(req.body.message, 600);
  const updated = await db.update('applications', app.id, { status, visitAt, updatedAt: now(),
    history: [...app.history, { status, at: now(), by: req.user.name, ...(note ? { note } : {}) }] });

  // Email + in-app notification to the applicant
  const extraByStatus = {
    Shortlisted: '<p>Great news — you have been <b>shortlisted</b>! Our team will contact you shortly to arrange a meet-and-greet visit at the shelter.</p>',
    'Visit Scheduled': `<p>Your visit to meet <b>${escapeHtml(app.petName)}</b> is booked for <b>${new Date(visitAt).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' })}</b>. Please bring photo ID.</p>`,
    Approved: '<p>Your application has been <b>approved</b>! We will be in touch to finalise the adoption paperwork.</p>',
    Rejected: '<p>Thank you for applying. After careful review we are unable to proceed with this application. Please do not be discouraged — our AI matching quiz can suggest other pets that suit your home.</p>',
    Pending: '<p>Your application has been moved back to pending review.</p>',
  };
  const extra = (extraByStatus[status] || '') + (note ? `<p><b>Message from the shelter:</b> ${escapeHtml(note)}</p>` : '');
  if (status === 'Adopted') emails.adoptionComplete(updated).catch(() => {});
  else emails.statusChanged(updated, extra).catch(() => {});
  await notify(app.userId, app.email, `${app.petName}: ${status}`,
    status === 'Visit Scheduled' ? `Your visit is booked for ${new Date(visitAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}.`
      : `Your application for ${app.petName} is now ${status}.`);

  // Keep the pet's availability in sync
  let closed = 0;
  if (status === 'Adopted') {
    await db.update('pets', app.petId, { status: 'Adopted', adoptedAt: now(), updatedAt: now() });
    // FR-12: automatically close every other open application for this pet
    const others = (await db.find('applications', { petId: app.petId })).filter((a) => a.id !== app.id && !CLOSED.includes(a.status));
    for (const o of others) {
      const closedApp = await db.update('applications', o.id, { status: 'Rejected', updatedAt: now(),
        history: [...o.history, { status: 'Rejected', at: now(), by: 'PawPal (automatic)', note: `${app.petName} was adopted by another applicant.` }] });
      emails.adoptionClosed(closedApp).catch(() => {});
      await notify(o.userId, o.email, `${app.petName} has found a home`, 'This application was closed automatically. Try the AI quiz to find your next match.', 'ai-matching.html');
      closed++;
    }
  } else if (['Visit Scheduled', 'Approved'].includes(status) && pet?.status === 'Available') {
    await db.update('pets', app.petId, { status: 'Pending Adoption', updatedAt: now() });
  } else if (['Rejected', 'Pending', 'Shortlisted'].includes(status)) {
    await releasePetIfIdle(app.petId);
  }

  res.json({ application: updated, closedOthers: closed,
    message: status === 'Adopted' ? `Adoption complete. ${closed ? `${closed} other application${closed > 1 ? 's were' : ' was'} closed and notified.` : ''}`.trim()
      : `Status updated to ${status}. The applicant has been emailed.` });
}));

router.patch('/:id/notes', requireStaff, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!app) throw new HttpError(404, 'Application not found.');
  const updated = await db.update('applications', app.id, { staffNotes: clean(req.body.staffNotes, 2000), updatedAt: now() });
  res.json({ application: updated, message: 'Notes saved.' });
}));

module.exports = router;
module.exports.STATUSES = STATUSES;
