// Adoption applications: submission with suitability scoring, the adoption workflow with status history,
// appointment scheduling, a message thread between adopter and shelter, and automatic closure when a pet is adopted.
const express = require('express');
const db = require('../db');
const { emails } = require('../services/mailer');
const { notify, notifyStaff, emailPrefs } = require('../services/notify');
const { calculateSuitabilityScore, LIVING_TYPES, EXPERIENCE } = require('../services/scoring');
const { requireAuth, requireAdopter, requireStaff, isStaff, shelterScope, inScope } = require('../middleware/auth');
const { APP_STATUSES, APP_CLOSED, APP_NEEDS_DATE, APP_HOLDS_PET, APP_FLOW, APP_STATUS_INFO } = require('../constants');
const { newId, now, asyncHandler, clean, toBool, toInt, isEmail, HttpError } = require('../utils');

const router = express.Router();
const OWNERSHIP = ['Own', 'Rent', 'Live with family'];

// What adopters may see about their own application (no suitability score, no staff notes)
const forApplicant = (a) => ({ id: a.id, petId: a.petId, petName: a.petName, petBreed: a.petBreed, petPhoto: a.petPhoto,
  status: a.status, statusInfo: APP_STATUS_INFO[a.status], history: (a.history || []).map((h) => ({ status: h.status, at: h.at, note: h.note || '' })),
  messages: (a.messages || []).map((m) => ({ from: m.from, name: m.from === 'staff' ? 'Shelter team' : m.name, text: m.text, at: m.at })),
  appointmentAt: a.appointmentAt || null, submittedAt: a.submittedAt, updatedAt: a.updatedAt,
  booking: a.bookingInvite && !APP_CLOSED.includes(a.status) ? { invited: true, message: a.bookingInvite.message || '', slotId: a.slotId || null,
    canChange: !a.slotId || new Date(a.appointmentAt).getTime() - Date.now() > CHANGE_CUTOFF_MS } : null,
  shelterId: a.shelterId || null, answers: { livingType: a.livingType, ownership: a.ownership, activityLevel: a.activityLevel, hoursAlone: a.hoursAlone,
    hasChildren: a.hasChildren, hasOtherPets: a.hasOtherPets, experience: a.experience, motivation: a.motivation } });

// Emails the applicant at the address on their application and, if different, their account email,
// and reports what happened so the person who triggered it can see whether it went out.
async function emailApplicant(kind, app, ...args) {
  const account = app.userId ? await db.findOne('users', { id: app.userId }) : null;
  const to = [...new Set([app.email, account?.email].map((e) => String(e || '').toLowerCase()).filter(isEmail))];
  const optOut = account && !emailPrefs(account).applications ? 'Not sent: the adopter turned off emails about their applications.' : '';
  const results = [];
  for (const email of to) {
    try { results.push(await emails[kind]({ ...app, email, skipReason: optOut }, ...args)); } catch (err) { results.push({ status: 'failed', error: err.message }); }
  }
  const pick = (status) => to.map((addr, i) => ({ to: addr, reason: results[i].error || '' })).filter((_, i) => results[i].status === status);
  const sent = pick('sent').map((x) => x.to);
  const skipped = [...pick('skipped'), ...pick('deferred')];
  const failed = pick('failed');
  return { to, sent, skipped, failed, status: sent.length ? 'sent' : failed.length ? 'failed' : skipped.length ? 'skipped' : 'none',
    error: failed[0]?.reason || skipped[0]?.reason || null };
}
// One sentence for the staff/adopter confirmation, e.g. "We emailed a@b.com." / "Email skipped: demo address."
function emailNote(r) {
  const parts = [];
  if (r.sent.length) parts.push(`We emailed ${r.sent.join(' and ')}.`);
  r.skipped.forEach((x) => parts.push(/demo or test address/.test(x.reason) ? `Email skipped for ${x.to}: demo address.`
    : /turned off/.test(x.reason) ? `Email not sent to ${x.to}: they turned off application emails.` : `Email to ${x.to} not sent (${x.reason.replace(/^Not sent:\s*/, '')}).`));
  r.failed.forEach((x) => parts.push(`The email to ${x.to} could not be sent (${x.reason}).`));
  return parts.length ? ` ${parts.join(' ')}` : '';
}

// Optional sections the shelter likes to have — used for "incomplete application" reporting
const missingSections = (a) => [!a.phone && 'phone', !a.address && 'address', !a.experienceDetails && 'experience details',
  a.ownership === 'Rent' && !a.landlordPermission && 'landlord permission', !a.workSchedule && 'work schedule'].filter(Boolean);

function readForm(b) {
  const form = {
    name: clean(b.name, 80), email: clean(b.email, 120).toLowerCase(), phone: clean(b.phone, 30), address: clean(b.address, 160),
    livingType: LIVING_TYPES.includes(b.livingType) ? b.livingType : '',
    ownership: OWNERSHIP.includes(b.ownership) ? b.ownership : '',
    landlordPermission: b.landlordPermission === undefined || b.landlordPermission === '' ? '' : toBool(b.landlordPermission),
    activityLevel: toInt(b.activityLevel, 1, 3, 0) || '',
    hoursAlone: b.hoursAlone === '' || b.hoursAlone === undefined ? '' : toInt(b.hoursAlone, 0, 24, 0),
    hasChildren: b.hasChildren === undefined || b.hasChildren === '' ? '' : toBool(b.hasChildren),
    childrenAges: clean(b.childrenAges, 80),
    hasOtherPets: b.hasOtherPets === undefined || b.hasOtherPets === '' ? '' : toBool(b.hasOtherPets),
    otherPetsDetails: clean(b.otherPetsDetails, 300),
    householdAdults: b.householdAdults === '' || b.householdAdults === undefined ? '' : toInt(b.householdAdults, 1, 12, 1),
    workSchedule: clean(b.workSchedule, 300),
    experience: EXPERIENCE.includes(b.experience) ? b.experience : '',
    experienceDetails: clean(b.experienceDetails, 1500), motivation: clean(b.motivation, 2000),
  };
  if (form.name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  if (!isEmail(form.email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (form.motivation.length < 20) throw new HttpError(400, 'Please tell the shelter a little more about why you want to adopt (at least 20 characters).');
  return form;
}

// ---- Adopter: submit an application ----
router.post('/', requireAdopter, asyncHandler(async (req, res) => {
  const pet = await db.findOne('pets', { id: clean(req.body.petId, 40) });
  if (!pet || !['Available', 'On Hold'].includes(pet.status)) throw new HttpError(400, 'This pet is no longer available for adoption.');
  const form = readForm(req.body);
  if (!toBool(req.body.declaration)) throw new HttpError(400, 'Please confirm that the information in your application is true and complete.');

  const result = calculateSuitabilityScore(form, pet);
  if (result.error) throw new HttpError(400, 'Please answer every question in the Home and Lifestyle sections.');

  const existing = (await db.find('applications', { petId: pet.id, userId: req.user.id })).find((a) => !APP_CLOSED.includes(a.status));
  if (existing) throw new HttpError(409, `You already have an open application for ${pet.name}.`);

  const at = now();
  const app = { id: newId('app'), petId: pet.id, petName: pet.name, petBreed: pet.breed, petPhoto: pet.photos?.[0] || '',
    shelterId: pet.shelterId || null, userId: req.user.id, ...form, declaration: true,
    score: result.score, label: result.label, breakdown: result.breakdown, notes: result.notes,
    status: 'Submitted', history: [{ status: 'Submitted', at, by: 'Applicant' }], messages: [], staffNotes: '', appointmentAt: null,
    submittedAt: at, updatedAt: at };
  await db.insert('applications', app);
  // Keep the adopter's profile up to date with the contact details they just gave
  if (!req.user.phone && form.phone) await db.update('users', req.user.id, { phone: form.phone });
  await notify(req.user.id, { type: 'application', title: 'Application submitted', message: `Your application for ${pet.name} has been sent to the shelter.`, link: `my-applications.html?id=${app.id}` }, { email: false });
  await notifyStaff(app.shelterId, { title: `New application for ${pet.name}`, message: `${form.name} applied to adopt ${pet.name}.`, link: `applications.html?id=${app.id}` });
  const mail = await emailApplicant('applicationReceived', app);
  res.status(201).json({ application: forApplicant(app), email: mail, message: `Application submitted.${mail.sent.length ? ` A confirmation is on its way to ${mail.sent.join(' and ')}.` : ''}` });
}));

// ---- Adopter: my applications ----
router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const mine = (await db.find('applications'))
    .filter((a) => a.userId === req.user.id || (!a.userId && a.email === req.user.email))
    .sort((a, b) => new Date(b.updatedAt || b.submittedAt) - new Date(a.updatedAt || a.submittedAt));
  res.json({ applications: mine.map(forApplicant), flow: APP_FLOW, info: APP_STATUS_INFO });
}));

const ownsApp = (req, a) => a && (a.userId === req.user.id || (!a.userId && a.email === req.user.email));

router.post('/:id/withdraw', requireAuth, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!ownsApp(req, app)) throw new HttpError(404, 'Application not found.');
  if (APP_CLOSED.includes(app.status)) throw new HttpError(400, 'This application is already closed.');
  const updated = await db.update('applications', app.id, { status: 'Withdrawn', updatedAt: now(),
    history: [...app.history, { status: 'Withdrawn', at: now(), by: 'Applicant' }] });
  await freeSlot(app);
  await releasePetIfIdle(app.petId);
  await notifyStaff(app.shelterId, { title: `Application withdrawn: ${app.petName}`, message: `${app.name} withdrew their application.`, link: `applications.html?id=${app.id}` });
  res.json({ application: forApplicant(updated), message: 'Application withdrawn.' });
}));

// ---- Messages between adopter and shelter ----
router.post('/:id/messages', requireAuth, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  const staff = isStaff(req);
  if (!app || (staff ? !inScope(req, app) : !ownsApp(req, app))) throw new HttpError(404, 'Application not found.');
  const text = clean(req.body.text, 2000);
  if (text.length < 2) throw new HttpError(400, 'Please write a message first.');
  if (APP_CLOSED.includes(app.status) && !staff) throw new HttpError(400, 'This application is closed. Contact the shelter directly if you need help.');
  const msg = { id: newId('msg'), from: staff ? 'staff' : 'applicant', name: req.user.name, text, at: now() };
  const patch = { messages: [...(app.messages || []), msg], updatedAt: now() };
  // An adopter replying to an information request sends the application back for review
  if (!staff && app.status === 'Info Requested') {
    patch.status = 'Under Review';
    patch.history = [...app.history, { status: 'Under Review', at: now(), by: 'Applicant', note: 'Applicant provided more information.' }];
  }
  const updated = await db.update('applications', app.id, patch);
  let mail = null;
  if (staff) {
    await notify(app.userId, { type: 'info', title: `Message about ${app.petName}`, message: text.slice(0, 140), link: `my-applications.html?id=${app.id}` }, { email: false });
    mail = await emailApplicant('shelterMessage', updated, text);
  } else {
    await notifyStaff(app.shelterId, { title: `Reply from ${app.name}`, message: `${app.petName}: ${text.slice(0, 120)}`, link: `applications.html?id=${app.id}` });
  }
  res.json({ application: staff ? updated : forApplicant(updated), ...(mail ? { email: mail, emailSent: mail.sent.length > 0, emailStatus: mail.status } : {}),
    message: patch.status ? 'Thanks — your reply was sent and your application is back under review.' : `Message sent.${mail ? emailNote(mail) : ''}` });
}));

// ---- Meet & greet booking (staff invite → adopter picks a slot) ----
const CHANGE_CUTOFF_MS = 24 * 60 * 60 * 1000; // adopters can change or cancel until 24 hours before
const BOOKABLE_FROM = ['Submitted', 'Under Review', 'Info Requested', 'Interview', 'Meet & Greet'];

// Frees the slot an application holds (when it closes, is cancelled or staff set a manual time)
async function freeSlot(app) {
  if (!app.slotId) return null;
  const slot = await db.updateWhere('slots', { id: app.slotId, bookedBy: app.id }, { bookedBy: null });
  return slot;
}

router.post('/:id/invite-booking', requireStaff, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!app || !inScope(req, app)) throw new HttpError(404, 'Application not found.');
  if (!BOOKABLE_FROM.includes(app.status)) throw new HttpError(400, `A meet & greet can't be booked while the application is ${app.status.toLowerCase()}.`);
  const message = clean(req.body.message, 1000);
  const freeSlots = (await db.find('slots', { shelterId: app.shelterId })).filter((sl) => !sl.bookedBy && new Date(sl.start) > new Date()).length;
  const at = now();
  const patch = { bookingInvite: { at, by: req.user.name, message, statusBefore: app.status }, updatedAt: at };
  if (message) patch.messages = [...(app.messages || []), { id: newId('msg'), from: 'staff', name: req.user.name, text: message, at }];
  const updated = await db.update('applications', app.id, patch);
  await notify(app.userId, { type: 'booking', title: `Book a time to meet ${app.petName}`, message: 'Choose a meet & greet time that suits you.',
    link: `my-applications.html?id=${app.id}#booking` }, { email: false });
  const mail = await emailApplicant('bookingInvite', updated, message);
  res.json({ application: updated, freeSlots, email: mail, emailSent: mail.sent.length > 0, emailStatus: mail.status,
    message: `${app.name.split(' ')[0]} was invited to book a meet & greet.${freeSlots ? '' : ' There are no free times yet — add some on the Availability page.'}${emailNote(mail)}` });
}));

// Free times the invited adopter can choose from (their application's shelter, next 60 days)
router.get('/:id/slots', requireAuth, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!ownsApp(req, app)) throw new HttpError(404, 'Application not found.');
  if (!app.bookingInvite || APP_CLOSED.includes(app.status)) throw new HttpError(400, 'The shelter hasn\'t invited you to book a meet & greet for this application yet.');
  const nowMs = Date.now(); const until = nowMs + 60 * 24 * 60 * 60 * 1000;
  const slots = (await db.find('slots', { shelterId: app.shelterId }))
    .filter((sl) => !sl.bookedBy && new Date(sl.start).getTime() > nowMs + 60 * 60 * 1000 && new Date(sl.start).getTime() < until)
    .sort((a, b) => new Date(a.start) - new Date(b.start)).slice(0, 120)
    .map((sl) => ({ id: sl.id, start: sl.start, durationMins: sl.durationMins }));
  res.json({ slots, current: app.slotId ? { slotId: app.slotId, start: app.appointmentAt } : null });
}));

async function holdPetFor(app) {
  const pet = await db.findOne('pets', { id: app.petId });
  if (pet?.status === 'Available') await db.update('pets', pet.id, { status: 'On Hold', updatedAt: now() });
}

router.post('/:id/book', requireAdopter, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!ownsApp(req, app)) throw new HttpError(404, 'Application not found.');
  if (!app.bookingInvite || APP_CLOSED.includes(app.status)) throw new HttpError(400, 'The shelter hasn\'t invited you to book a meet & greet for this application.');
  if (!BOOKABLE_FROM.includes(app.status)) throw new HttpError(400, `Your application is ${app.status.toLowerCase()}, so the meet & greet can't be changed here. Message the shelter instead.`);
  const rescheduling = Boolean(app.slotId);
  if (rescheduling && new Date(app.appointmentAt).getTime() - Date.now() <= CHANGE_CUTOFF_MS) {
    throw new HttpError(400, 'Your meet & greet is less than 24 hours away, so it can\'t be changed online. Please message the shelter.');
  }
  const slotId = clean(req.body.slotId, 40);
  const slot = slotId && await db.findOne('slots', { id: slotId });
  if (!slot || slot.shelterId !== app.shelterId) throw new HttpError(404, 'That time is not available.');
  if (new Date(slot.start).getTime() <= Date.now() + 60 * 60 * 1000) throw new HttpError(400, 'That time is too soon — please choose a later one.');
  if (slot.id === app.slotId) throw new HttpError(400, 'You are already booked at that time.');
  // Claim the slot only if it is still free at this exact moment (atomic in MongoDB) — prevents double booking
  const claimed = await db.updateWhere('slots', { id: slot.id, bookedBy: null }, { bookedBy: app.id, bookedAt: now() });
  if (!claimed) throw new HttpError(409, 'Sorry — someone has just booked that time. Please choose another.');
  const previousStart = app.appointmentAt;
  if (rescheduling) await freeSlot(app);
  const at = now();
  const updated = await db.update('applications', app.id, { status: 'Meet & Greet', appointmentAt: slot.start, slotId: slot.id, updatedAt: at,
    history: [...app.history, { status: 'Meet & Greet', at, by: 'Applicant', note: rescheduling ? 'Rescheduled by applicant' : 'Booked by applicant', appointmentAt: slot.start }] });
  await holdPetFor(app);
  const when = new Date(slot.start).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' });
  await notify(app.userId, { type: 'booking', title: `${rescheduling ? 'Meet & greet moved' : 'Meet & greet booked'}: ${app.petName}`,
    message: `You're booked to meet ${app.petName} on ${when}.`, link: `my-applications.html?id=${app.id}#booking` }, { email: false });
  await notifyStaff(app.shelterId, { title: `${rescheduling ? 'Meet & greet rescheduled' : 'Meet & greet booked'}: ${app.petName}`,
    message: `${app.name} ${rescheduling ? `moved their meet & greet from ${new Date(previousStart).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' })} to` : 'booked'} ${when}.`,
    link: `applications.html?id=${app.id}` });
  const mail = await emailApplicant('bookingConfirmed', updated, { rescheduled: rescheduling });
  res.json({ application: forApplicant(updated), email: mail, emailStatus: mail.status,
    message: `${rescheduling ? 'Moved' : 'Booked'}! See you on ${when}.${mail.sent.length ? ' A confirmation email is on its way.' : ''}` });
}));

router.post('/:id/cancel-booking', requireAdopter, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!ownsApp(req, app)) throw new HttpError(404, 'Application not found.');
  if (!app.slotId || app.status !== 'Meet & Greet') throw new HttpError(400, 'There is no booked meet & greet to cancel.');
  if (new Date(app.appointmentAt).getTime() - Date.now() <= CHANGE_CUTOFF_MS) {
    throw new HttpError(400, 'Your meet & greet is less than 24 hours away, so it can\'t be cancelled online. Please message the shelter.');
  }
  await freeSlot(app);
  const at = now();
  const back = BOOKABLE_FROM.includes(app.bookingInvite?.statusBefore) && app.bookingInvite.statusBefore !== 'Meet & Greet' ? app.bookingInvite.statusBefore : 'Under Review';
  const updated = await db.update('applications', app.id, { status: back, appointmentAt: null, slotId: null, updatedAt: at,
    history: [...app.history, { status: back, at, by: 'Applicant', note: 'Meet & greet cancelled by applicant' }] });
  await releasePetIfIdle(app.petId);
  await notify(app.userId, { type: 'booking', title: `Meet & greet cancelled: ${app.petName}`, message: 'Choose another time whenever you\'re ready.',
    link: `my-applications.html?id=${app.id}#booking` }, { email: false });
  await notifyStaff(app.shelterId, { title: `Meet & greet cancelled: ${app.petName}`, message: `${app.name} cancelled their meet & greet. The time is free again.`,
    link: `applications.html?id=${app.id}` });
  const mail = await emailApplicant('bookingCancelled', updated, app.appointmentAt);
  res.json({ application: forApplicant(updated), email: mail, emailStatus: mail.status, message: 'Your meet & greet was cancelled and the time is free again.' });
}));

// ---- Staff: list ----
router.get('/', requireStaff, asyncHandler(async (req, res) => {
  let apps = await db.find('applications');
  const scope = shelterScope(req);
  if (scope) apps = apps.filter((a) => a.shelterId === scope);
  if (req.query.petId) apps = apps.filter((a) => a.petId === req.query.petId);
  if (req.query.status === 'open') apps = apps.filter((a) => !APP_CLOSED.includes(a.status));
  else if (req.query.status) apps = apps.filter((a) => a.status === req.query.status);
  const q = clean(req.query.q, 80).toLowerCase();
  if (q) apps = apps.filter((a) => `${a.name} ${a.email} ${a.petName}`.toLowerCase().includes(q));
  const sort = req.query.sort || 'newest';
  apps.sort(sort === 'score' ? (a, b) => b.score - a.score : sort === 'oldest' ? (a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)
    : (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  const counts = APP_STATUSES.reduce((m, s) => ((m[s] = 0), m), {});
  (await db.find('applications')).filter((a) => !scope || a.shelterId === scope).forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1; });
  const limit = toInt(req.query.limit, 1, 500, 500);
  res.json({ applications: apps.slice(0, limit).map((a) => ({ ...a, missing: missingSections(a) })), total: apps.length, statuses: APP_STATUSES, counts });
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!app) throw new HttpError(404, 'Application not found.');
  if (isStaff(req)) {
    if (!inScope(req, app)) throw new HttpError(404, 'Application not found.');
    const rivals = (await db.find('applications', { petId: app.petId })).filter((a) => a.status !== 'Withdrawn').sort((a, b) => b.score - a.score);
    return res.json({ application: { ...app, missing: missingSections(app) }, rank: rivals.findIndex((a) => a.id === app.id) + 1, totalForPet: rivals.length, statuses: APP_STATUSES });
  }
  if (!ownsApp(req, app)) throw new HttpError(404, 'Application not found.');
  res.json({ application: forApplicant(app) });
}));

// Put a pet back on the market when nobody is progressing with it any more
async function releasePetIfIdle(petId) {
  const pet = await db.findOne('pets', { id: petId });
  if (!pet || pet.status !== 'On Hold') return;
  const active = (await db.find('applications', { petId })).some((a) => APP_HOLDS_PET.includes(a.status));
  if (!active) await db.update('pets', petId, { status: 'Available', updatedAt: now() });
}

const STATUS_NOTE_TYPE = { 'Info Requested': 'info', Interview: 'appointment', 'Meet & Greet': 'appointment', 'Adoption Scheduled': 'appointment',
  Approved: 'approved', Declined: 'declined', Adopted: 'adopted' };

// ---- Staff: change status ----
router.patch('/:id/status', requireStaff, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!app || !inScope(req, app)) throw new HttpError(404, 'Application not found.');
  const status = req.body.status;
  if (!APP_STATUSES.includes(status) || status === 'Withdrawn') throw new HttpError(400, 'Please choose a valid status.');
  if (APP_CLOSED.includes(app.status)) throw new HttpError(400, `This application is ${app.status.toLowerCase()} and can no longer be changed.`);
  if (app.status === status && !APP_NEEDS_DATE.includes(status)) throw new HttpError(400, `This application is already ${status}.`);
  const note = clean(req.body.message, 1000);
  if (status === 'Info Requested' && note.length < 5) throw new HttpError(400, 'Tell the applicant what information you need.');

  let appointmentAt = APP_NEEDS_DATE.includes(status) ? null : app.appointmentAt;
  if (APP_NEEDS_DATE.includes(status)) {
    const d = req.body.appointmentAt || req.body.visitAt ? new Date(req.body.appointmentAt || req.body.visitAt) : null;
    if (!d || Number.isNaN(d.getTime())) throw new HttpError(400, 'Please choose a date and time for the appointment.');
    appointmentAt = d.toISOString();
  }
  const pet = await db.findOne('pets', { id: app.petId });
  if (status === 'Adopted' && pet?.status === 'Adopted') throw new HttpError(400, `${app.petName} has already been adopted by another applicant.`);

  const at = now();
  const patch = { status, appointmentAt, updatedAt: at, history: [...app.history, { status, at, by: req.user.name, ...(note ? { note } : {}), ...(appointmentAt && APP_NEEDS_DATE.includes(status) ? { appointmentAt } : {}) }] };
  // A booked meet & greet slot no longer applies when the application closes, staff set a time manually, or it
  // moves back before the meeting took place — free it so other adopters can book it
  if (app.slotId && (APP_CLOSED.includes(status) || status === 'Meet & Greet'
    || (new Date(app.appointmentAt) > new Date() && !['Approved', 'Adoption Scheduled'].includes(status)))) {
    await freeSlot(app);
    patch.slotId = null;
  }
  if (note) patch.messages = [...(app.messages || []), { id: newId('msg'), from: 'staff', name: req.user.name, text: note, at }];
  const updated = await db.update('applications', app.id, patch);

  const mail = await emailApplicant(status === 'Adopted' ? 'adoptionComplete' : 'statusChanged', updated, ...(status === 'Adopted' ? [] : [note]));
  const when = appointmentAt ? new Date(appointmentAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  await notify(app.userId, { type: STATUS_NOTE_TYPE[status] || 'status', title: `${app.petName}: ${status}`,
    message: APP_NEEDS_DATE.includes(status) ? `${status} booked for ${when}.` : status === 'Info Requested' ? 'The shelter needs more information — tap to reply.' : APP_STATUS_INFO[status],
    link: `my-applications.html?id=${app.id}` }, { email: false });

  // Keep the pet's availability in sync with the pipeline
  let closed = 0;
  if (status === 'Adopted') {
    await db.update('pets', app.petId, { status: 'Adopted', adoptedAt: at, updatedAt: at });
    const others = (await db.find('applications', { petId: app.petId })).filter((a) => a.id !== app.id && !APP_CLOSED.includes(a.status));
    for (const o of others) {
      await freeSlot(o);
      const closedApp = await db.update('applications', o.id, { status: 'Declined', updatedAt: at, slotId: null,
        history: [...o.history, { status: 'Declined', at, by: 'PawPal (automatic)', note: `${app.petName} was adopted by another applicant.` }] });
      await emailApplicant('adoptionClosed', closedApp);
      await notify(o.userId, { type: 'declined', title: `${app.petName} has found a home`, message: 'This application was closed automatically. PawPal can suggest other pets for you.', link: 'ai-matching.html' }, { email: false });
      closed++;
    }
    const favs = await db.find('favourites', { petId: app.petId });
    for (const f of favs.filter((x) => x.userId !== app.userId)) {
      await notify(f.userId, { type: 'pet', title: `${app.petName} has been adopted`, message: `${app.petName}, who you saved, has found a home. PawPal can suggest similar pets.`, link: 'ai-matching.html' });
    }
  } else if (APP_HOLDS_PET.includes(status) && pet?.status === 'Available') {
    await db.update('pets', app.petId, { status: 'On Hold', updatedAt: at });
  } else if (!APP_HOLDS_PET.includes(status)) {
    await releasePetIfIdle(app.petId);
  }

  res.json({ application: updated, closedOthers: closed, email: mail, emailSent: mail.sent.length > 0, emailStatus: mail.status,
    message: (status === 'Adopted' ? `Adoption complete.${closed ? ` ${closed} other application${closed > 1 ? 's were' : ' was'} closed and notified.` : ''}`
      : `Status updated to ${status}. The applicant was notified in the app.`) + emailNote(mail) });
}));

router.patch('/:id/notes', requireStaff, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!app || !inScope(req, app)) throw new HttpError(404, 'Application not found.');
  const updated = await db.update('applications', app.id, { staffNotes: clean(req.body.staffNotes, 3000), updatedAt: now() });
  res.json({ application: updated, message: 'Private notes saved.' });
}));

module.exports = router;
Object.assign(module.exports, { forApplicant, missingSections });
