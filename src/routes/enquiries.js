// Enquiries: an adopter asks the shelter a question about a specific pet; staff reply.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { emails } = require('../services/mailer');
const { notify, notifyStaff } = require('../services/notify');
const { requireAuth, requireAdopter, requireStaff, shelterScope, inScope } = require('../middleware/auth');
const { newId, now, asyncHandler, clean, HttpError } = require('../utils');

const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, message: { error: 'Too many questions in a short time. Please try again later.' } });

const forAdopter = (e) => ({ id: e.id, petId: e.petId, petName: e.petName, message: e.message, status: e.status, reply: e.reply || '', at: e.at, repliedAt: e.repliedAt || null });

router.post('/', requireAdopter, limiter, asyncHandler(async (req, res) => {
  const pet = await db.findOne('pets', { id: clean(req.body.petId, 40) });
  if (!pet || !['Available', 'On Hold'].includes(pet.status)) throw new HttpError(404, 'This pet is not available.');
  const message = clean(req.body.message, 1500);
  if (message.length < 10) throw new HttpError(400, 'Please write your question (at least 10 characters).');
  const enq = { id: newId('enq'), petId: pet.id, petName: pet.name, shelterId: pet.shelterId || null, userId: req.user.id,
    name: req.user.name, email: req.user.email, message, status: 'Open', reply: '', at: now() };
  await db.insert('enquiries', enq);
  await notifyStaff(enq.shelterId, { title: `New question about ${pet.name}`, message: `${req.user.name}: ${message.slice(0, 120)}`, link: `enquiries.html?id=${enq.id}` });
  emails.enquiryReceived(enq).catch(() => {});
  res.status(201).json({ enquiry: forAdopter(enq), message: 'Your question was sent to the shelter. You\'ll get an email and a notification when they reply.' });
}));

router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const list = (await db.find('enquiries', { userId: req.user.id })).sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ enquiries: list.map(forAdopter) });
}));

router.get('/', requireStaff, asyncHandler(async (req, res) => {
  let list = await db.find('enquiries');
  const scope = shelterScope(req);
  if (scope) list = list.filter((e) => e.shelterId === scope);
  if (req.query.status) list = list.filter((e) => e.status === req.query.status);
  list.sort((a, b) => (a.status === 'Open') === (b.status === 'Open') ? new Date(b.at) - new Date(a.at) : a.status === 'Open' ? -1 : 1);
  res.json({ enquiries: list, open: list.filter((e) => e.status === 'Open').length });
}));

router.post('/:id/reply', requireStaff, asyncHandler(async (req, res) => {
  const enq = await db.findOne('enquiries', { id: req.params.id });
  if (!enq || !inScope(req, enq)) throw new HttpError(404, 'Enquiry not found.');
  const reply = clean(req.body.reply, 2000);
  if (reply.length < 2) throw new HttpError(400, 'Please write a reply.');
  const updated = await db.update('enquiries', enq.id, { reply, status: 'Answered', repliedBy: req.user.name, repliedAt: now() });
  await notify(enq.userId, { type: 'enquiry', title: `Reply about ${enq.petName}`, message: reply.slice(0, 140), link: 'dashboard.html#enquiries' }, { email: false });
  emails.enquiryReply(updated).catch(() => {});
  res.json({ enquiry: updated, message: 'Reply sent — the adopter has been emailed.' });
}));

router.post('/:id/close', requireStaff, asyncHandler(async (req, res) => {
  const enq = await db.findOne('enquiries', { id: req.params.id });
  if (!enq || !inScope(req, enq)) throw new HttpError(404, 'Enquiry not found.');
  const updated = await db.update('enquiries', enq.id, { status: 'Closed' });
  res.json({ enquiry: updated, message: 'Enquiry closed.' });
}));

module.exports = router;
