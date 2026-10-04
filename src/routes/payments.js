// Simulated adoption-fee payments (NO real payments — test cards only, see services/payments.js).
// Card details are validated and then discarded: only { id, applicationId, userId, amount, brand, last4, status,
// receiptNo, paidAt } is stored. Payments are idempotent: a paid application can never be charged again.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth, requireAdopter, requireStaff, isStaff, inScope } = require('../middleware/auth');
const { checkCard, receiptNumber, TEST_CARDS } = require('../services/payments');
const { emails } = require('../services/mailer');
const { notify } = require('../services/notify');
const { newId, now, asyncHandler, clean, HttpError } = require('../utils');

const router = express.Router();
const payLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.id}`, message: { error: 'Too many payment attempts — please wait 15 minutes and try again.' } });

// Fields that may be stored or returned — never the card number or CVC
const record = (p) => p && ({ id: p.id, applicationId: p.applicationId, userId: p.userId, amount: p.amount, brand: p.brand, last4: p.last4,
  status: p.status, receiptNo: p.receiptNo, paidAt: p.paidAt });

// The fee is fixed when the adoption is completed (feeDue on the application)
const amountOf = (app) => (app.status === 'Adopted' && Number.isFinite(app.feeDue) ? app.feeDue : null);
function stateOf(app) {
  const amount = amountOf(app);
  if (amount === null) return 'not_due';
  if (amount <= 0) return 'no_fee';
  return app.paymentStatus || 'due';
}

async function loadApp(req, id) {
  const app = await db.findOne('applications', { id: clean(id, 40) });
  if (!app || (isStaff(req) ? !inScope(req, app) : app.userId !== req.user.id)) throw new HttpError(404, 'Application not found.');
  return app;
}

// Atomically move the application from one of `from` to `to` (so two clicks can't both charge).
// paymentStatus is set to 'due' when the adoption is completed (routes/applications.js).
async function claim(app, from, to) {
  for (const f of from) {
    const got = await db.updateWhere('applications', { id: app.id, paymentStatus: f }, { paymentStatus: to });
    if (got) return f;
  }
  return null;
}

async function paid(app, payment, user) {
  await db.insert('payments', payment);
  const updated = await db.update('applications', app.id, { paymentStatus: 'paid', paymentId: payment.id, updatedAt: now() });
  const account = user || await db.findOne('users', { id: app.userId });
  await notify(app.userId, { type: 'payment', title: `Adoption fee paid: ${app.petName}`, message: `Receipt ${payment.receiptNo} — $${payment.amount}. Thank you!`,
    link: `receipt.html?id=${payment.id}` }, { email: false }); // the receipt email below is this notification's email
  if (account) emails.paymentReceipt(account, payment, app).catch((err) => console.warn('Receipt email failed:', err.message));
  return updated;
}

// ---- Checkout details for one application ----
router.get('/application/:id', requireAuth, asyncHandler(async (req, res) => {
  const app = await loadApp(req, req.params.id);
  const [shelter, payment] = await Promise.all([db.findOne('shelters', { id: app.shelterId }), app.paymentId ? db.findOne('payments', { id: app.paymentId }) : null]);
  res.json({ application: { id: app.id, petId: app.petId, petName: app.petName, petPhoto: app.petPhoto, status: app.status },
    shelter: shelter ? { name: shelter.name, address: shelter.address, phone: shelter.phone, hours: shelter.hours } : null,
    amount: amountOf(app), paymentStatus: stateOf(app), payment: record(payment), simulation: true,
    testCards: Object.entries(TEST_CARDS).map(([n, o]) => ({ number: n.replace(/(\d{4})(?=\d)/g, '$1 '), result: o.status })) });
}));

// ---- Pay by (test) card ----
router.post('/checkout', requireAdopter, payLimiter, asyncHandler(async (req, res) => {
  const card = req.body?.card;
  if (req.body) delete req.body.card; // nothing after this point (including error logging) can see the card details
  const app = await loadApp(req, req.body?.applicationId);
  const state = stateOf(app);
  if (state === 'paid') {
    const payment = record(await db.findOne('payments', { id: app.paymentId }));
    return res.status(409).json({ error: 'This adoption fee has already been paid.', payment });
  }
  if (state === 'processing') throw new HttpError(409, 'A payment for this adoption is already being processed.');
  if (state !== 'due' && state !== 'pay_in_person') throw new HttpError(400, state === 'no_fee' ? 'There is no adoption fee to pay.' : 'The adoption fee is due once the adoption is complete.');
  const { brand, last4, outcome } = checkCard(card || {});

  const previous = await claim(app, ['due', 'pay_in_person'], 'processing');
  if (!previous) {
    const fresh = await db.findOne('applications', { id: app.id });
    if (fresh.paymentStatus === 'paid') return res.status(409).json({ error: 'This adoption fee has already been paid.', payment: record(await db.findOne('payments', { id: fresh.paymentId })) });
    throw new HttpError(409, 'A payment for this adoption is already being processed.');
  }
  const base = { id: newId('pay'), applicationId: app.id, userId: req.user.id, amount: amountOf(app), brand, last4 };
  try {
    if (outcome.status !== 'succeeded') {
      await db.insert('payments', { ...base, status: outcome.status, receiptNo: null, paidAt: null });
      await db.update('applications', app.id, { paymentStatus: previous });
      return res.status(402).json({ error: outcome.message, code: outcome.status });
    }
    const payment = { ...base, status: 'succeeded', receiptNo: receiptNumber(), paidAt: now() };
    await paid(app, payment, req.user);
    res.status(201).json({ payment: record(payment), message: `Payment successful. Receipt ${payment.receiptNo}.` });
  } catch (err) {
    const cur = await db.findOne('applications', { id: app.id });
    if (cur?.paymentStatus === 'processing') await db.update('applications', app.id, { paymentStatus: previous });
    throw err;
  }
}));

// ---- Choose to pay at the shelter instead ----
router.post('/pay-in-person', requireAdopter, payLimiter, asyncHandler(async (req, res) => {
  const app = await loadApp(req, req.body?.applicationId);
  const state = stateOf(app);
  if (state === 'pay_in_person') return res.json({ paymentStatus: state, message: 'You\'ve already chosen to pay at the shelter.' });
  if (state === 'paid') throw new HttpError(409, 'This adoption fee has already been paid.');
  if (state !== 'due') throw new HttpError(400, state === 'no_fee' ? 'There is no adoption fee to pay.' : 'The adoption fee is due once the adoption is complete.');
  if (!(await claim(app, ['due'], 'pay_in_person'))) throw new HttpError(409, 'The payment status just changed — please refresh the page.');
  await db.insert('payments', { id: newId('pay'), applicationId: app.id, userId: req.user.id, amount: amountOf(app), brand: null, last4: null,
    status: 'pay_in_person', receiptNo: null, paidAt: null });
  const shelter = await db.findOne('shelters', { id: app.shelterId });
  await notify(app.userId, { type: 'payment', title: `Pay at the shelter: ${app.petName}`,
    message: `Please pay the $${amountOf(app)} adoption fee at ${shelter?.name || 'the shelter'}. You can still pay online any time.`, link: `checkout.html?app=${app.id}` });
  res.json({ paymentStatus: 'pay_in_person', message: `No problem — you can pay the $${amountOf(app)} fee at ${shelter?.name || 'the shelter'}.` });
}));

// ---- Staff: record a payment taken at the shelter ----
router.post('/application/:id/record', requireStaff, asyncHandler(async (req, res) => {
  const app = await loadApp(req, req.params.id);
  const state = stateOf(app);
  if (state === 'paid') throw new HttpError(409, 'This adoption fee has already been paid.');
  if (state !== 'due' && state !== 'pay_in_person') throw new HttpError(400, state === 'no_fee' ? 'There is no adoption fee for this adoption.' : 'The fee is due once the adoption is complete.');
  if (!(await claim(app, ['due', 'pay_in_person'], 'processing'))) throw new HttpError(409, 'The payment status just changed — please refresh.');
  const payment = { id: newId('pay'), applicationId: app.id, userId: app.userId, amount: amountOf(app), brand: 'Paid at the shelter', last4: null,
    status: 'succeeded', receiptNo: receiptNumber(), paidAt: now() };
  await paid(app, payment);
  res.status(201).json({ payment: record(payment), message: `Payment recorded. Receipt ${payment.receiptNo} was sent to the adopter.` });
}));

// ---- Receipt ----
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const payment = await db.findOne('payments', { id: clean(req.params.id, 40) });
  if (!payment || payment.status !== 'succeeded') throw new HttpError(404, 'Receipt not found.');
  const app = await db.findOne('applications', { id: payment.applicationId });
  if (!app || (isStaff(req) ? !inScope(req, app) : payment.userId !== req.user.id)) throw new HttpError(404, 'Receipt not found.');
  const shelter = await db.findOne('shelters', { id: app.shelterId });
  res.json({ payment: record(payment), application: { id: app.id, petName: app.petName, petBreed: app.petBreed, adopter: app.name },
    shelter: shelter ? { name: shelter.name, address: shelter.address, phone: shelter.phone, email: shelter.email } : null, simulation: true });
}));

module.exports = router;
