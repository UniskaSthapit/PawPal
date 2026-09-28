// Smaller API areas: AI, analytics, notifications, users/staff, vets, events, system.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const ai = require('../services/ai');
const maps = require('../services/maps');
const { emails, sendMail, smtpEnabled } = require('../services/mailer');
const { petMatchScore, matchReasons } = require('../services/scoring');
const { seedIfEmpty } = require('../services/seed');
const { requireAuth, requireStaff, publicUser } = require('../middleware/auth');
const { toPublic } = require('./pets');
const { newId, now, asyncHandler, clean, toBool, toInt, isEmail, passwordProblem, HttpError } = require('../utils');

const router = express.Router();
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, message: { error: 'Too many requests. Please slow down a little.' } });
const available = async () => (await db.find('pets')).filter((p) => p.status === 'Available');

// ================= AI =================
// FR-02: generate a pet description (staff)
router.post('/ai/describe', requireStaff, aiLimiter, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const pet = { name: clean(b.name, 40), type: clean(b.type, 20), breed: clean(b.breed, 60), age: toInt(b.age, 0, 30, 0),
    gender: clean(b.gender, 10), size: clean(b.size, 10), energyLevel: toInt(b.energyLevel, 1, 3, 2),
    traits: (Array.isArray(b.traits) ? b.traits : String(b.traits || '').split(',')).map((t) => clean(String(t), 30)).filter(Boolean),
    goodWithChildren: toBool(b.goodWithChildren), goodWithOtherPets: toBool(b.goodWithOtherPets), requiresYard: toBool(b.requiresYard) };
  if (!pet.name || !pet.breed) throw new HttpError(400, 'Add at least the pet\'s name and breed first.');
  const result = await ai.describePet(pet);
  res.json({ description: result.text, source: result.source });
}));

// FR-05: rank pets for quiz answers
router.post('/ai/match', aiLimiter, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const answers = { homeType: ['apartment', 'house', 'farm'].includes(b.homeType) ? b.homeType : 'house',
    activity: toInt(b.activity, 1, 3, 2), hasChildren: toBool(b.hasChildren), hasOtherPets: toBool(b.hasOtherPets),
    hoursAlone: toInt(b.hoursAlone, 0, 24, 4), preferredType: ['dog', 'cat', 'other', 'any'].includes(b.preferredType) ? b.preferredType : 'any' };
  const ranked = (await available())
    .map((p) => ({ pet: toPublic(p), match: petMatchScore(p, answers), reasons: matchReasons(p, answers) }))
    .sort((a, b2) => b2.match - a.match);
  if (toBool(b.final)) await db.insert('events', { id: newId('evt'), type: 'ai_match', at: now() });
  res.json({ matches: ranked.slice(0, toInt(b.limit, 1, 12, 3)) });
}));

// FR-10: chatbot
router.post('/ai/chat', aiLimiter, asyncHandler(async (req, res) => {
  const message = clean(req.body?.message, 600);
  if (!message) throw new HttpError(400, 'Type a message first.');
  const history = Array.isArray(req.body.history) ? req.body.history.slice(-10) : [];
  const prefs = typeof req.body.prefs === 'object' && req.body.prefs ? req.body.prefs : {};
  const result = await ai.chat({ message, history, prefs }, await available());
  await db.insert('events', { id: newId('evt'), type: 'ai_chat', at: now() });
  res.json({ reply: result.reply, prefs: result.prefs, source: result.source,
    picks: result.picks.map((p) => ({ pet: toPublic(p.pet), match: p.match, reasons: p.reasons })) });
}));

// ================= ANALYTICS (FR-06) =================
const inRange = (iso, from, to) => { const t = new Date(iso).getTime(); return t >= from && t <= to; };
function parseRange(q) {
  const to = q.to ? new Date(q.to + 'T23:59:59') : new Date();
  const from = q.from ? new Date(q.from + 'T00:00:00') : new Date(to.getTime() - 29 * 86400000);
  return { from: from.getTime(), to: to.getTime() };
}
const pctChange = (cur, prev) => (prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 1000) / 10);

router.get('/analytics/dashboard', requireStaff, asyncHandler(async (req, res) => {
  const [pets, apps, mails] = await Promise.all([db.find('pets'), db.find('applications'), db.find('emails')]);
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const adoptedAt = (a) => a.history.find((h) => h.status === 'Adopted')?.at;
  const adoptedThis = apps.filter((a) => a.status === 'Adopted' && new Date(adoptedAt(a)).getTime() >= monthStart).length;
  const adoptedPrev = apps.filter((a) => { const t = new Date(adoptedAt(a)).getTime(); return a.status === 'Adopted' && t >= prevStart && t < monthStart; }).length;
  const newThis = apps.filter((a) => new Date(a.submittedAt).getTime() >= monthStart).length;
  const newPrev = apps.filter((a) => { const t = new Date(a.submittedAt).getTime(); return t >= prevStart && t < monthStart; }).length;
  const petsThis = pets.filter((p) => new Date(p.createdAt).getTime() >= monthStart).length;
  const sent = mails.filter((m) => m.status === 'sent').length;
  res.json({
    availablePets: pets.filter((p) => p.status === 'Available').length,
    newPetsThisMonth: petsThis,
    openApplications: apps.filter((a) => !['Rejected', 'Adopted', 'Withdrawn'].includes(a.status)).length,
    newApplicationsChange: pctChange(newThis, newPrev),
    adoptedThisMonth: adoptedThis,
    adoptedChange: pctChange(adoptedThis, adoptedPrev),
    emailSuccessRate: mails.length ? Math.round((sent / mails.length) * 100) : 100,
    emailsSent: mails.length,
    pendingReview: apps.filter((a) => a.status === 'Pending').length,
    upcomingVisits: apps.filter((a) => a.status === 'Visit Scheduled' && a.visitAt && new Date(a.visitAt) > new Date())
      .sort((a, b) => new Date(a.visitAt) - new Date(b.visitAt)).slice(0, 4)
      .map((a) => ({ id: a.id, name: a.name, petName: a.petName, visitAt: a.visitAt })),
  });
}));

router.get('/analytics', requireStaff, asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const span = to - from;
  const [searchesAll, appsAll, eventsAll] = await Promise.all([db.find('searches'), db.find('applications'), db.find('events')]);
  const searches = searchesAll.filter((s) => inRange(s.at, from, to));
  const apps = appsAll.filter((a) => inRange(a.submittedAt, from, to));
  const events = eventsAll.filter((e) => inRange(e.at, from, to));
  const prevSearches = searchesAll.filter((s) => inRange(s.at, from - span, from - 1)).length;
  const prevApps = appsAll.filter((a) => inRange(a.submittedAt, from - span, from - 1)).length;
  const prevVisits = eventsAll.filter((e) => e.type === 'visit' && inRange(e.at, from - span, from - 1)).length;
  const adoptions = appsAll.filter((a) => a.history.some((h) => h.status === 'Adopted' && inRange(h.at, from, to)));
  const prevAdoptions = appsAll.filter((a) => a.history.some((h) => h.status === 'Adopted' && inRange(h.at, from - span, from - 1))).length;

  const count = (list, key) => list.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {});
  const kw = count(searches, 'keyword');
  const zero = count(searches.filter((s) => s.results === 0), 'keyword');
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekly = days.map(() => 0);
  apps.forEach((a) => { weekly[(new Date(a.submittedAt).getDay() + 6) % 7]++; });

  // Weekly buckets for "AI suggestions vs adoptions"
  const buckets = [];
  const weekMs = 7 * 86400000;
  for (let start = from; start <= to; start += weekMs) buckets.push({ start, end: Math.min(start + weekMs - 1, to) });
  const trend = buckets.map((b) => ({
    label: new Date(b.start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    aiMatches: eventsAll.filter((e) => (e.type === 'ai_match' || e.type === 'ai_chat') && inRange(e.at, b.start, b.end)).length,
    adoptions: appsAll.filter((a) => a.history.some((h) => h.status === 'Adopted' && inRange(h.at, b.start, b.end))).length,
    inquiries: appsAll.filter((a) => inRange(a.submittedAt, b.start, b.end)).length,
  }));

  const visits = events.filter((e) => e.type === 'visit').length;
  res.json({
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    stats: {
      visitors: visits, visitorsChange: pctChange(visits, prevVisits),
      searches: searches.length, searchesChange: pctChange(searches.length, prevSearches),
      inquiries: apps.length, inquiriesChange: pctChange(apps.length, prevApps),
      adoptions: adoptions.length, adoptionsChange: pctChange(adoptions.length, prevAdoptions),
      aiMatches: events.filter((e) => e.type === 'ai_match' || e.type === 'ai_chat').length,
      averageScore: apps.length ? Math.round(apps.reduce((t, a) => t + a.score, 0) / apps.length) : 0,
      conversion: visits ? Math.round((apps.length / visits) * 1000) / 10 : 0,
    },
    topKeywords: Object.entries(kw).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([keyword, n]) => ({ keyword, count: n })),
    zeroResultKeywords: Object.entries(zero).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([keyword, n]) => ({ keyword, count: n })),
    weekly: days.map((day, i) => ({ day, count: weekly[i] })),
    trend,
    statusCounts: ['Pending', 'Shortlisted', 'Visit Scheduled', 'Approved', 'Rejected', 'Adopted', 'Withdrawn']
      .map((s) => ({ status: s, count: apps.filter((a) => a.status === s).length })),
    petTypeDemand: Object.entries(apps.reduce((m, a) => { const t = a.petBreed || 'Other'; m[t] = (m[t] || 0) + 1; return m; }, {}))
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([breed, n]) => ({ breed, count: n })),
  });
}));

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
router.get('/analytics/export', requireStaff, asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const type = req.query.type === 'searches' ? 'searches' : 'applications';
  let rows;
  if (type === 'searches') {
    rows = [['Keyword', 'Results', 'Date']].concat((await db.find('searches')).filter((s) => inRange(s.at, from, to))
      .map((s) => [s.keyword, s.results, s.at]));
  } else {
    rows = [['Applicant', 'Email', 'Pet', 'AI score', 'Match', 'Status', 'Living', 'Experience', 'Submitted']]
      .concat((await db.find('applications')).filter((a) => inRange(a.submittedAt, from, to))
        .map((a) => [a.name, a.email, a.petName, a.score, a.label, a.status, a.livingType, a.experience, a.submittedAt]));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pawpal-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(rows.map((r) => r.map(csvCell).join(',')).join('\n'));
}));

// ================= NOTIFICATIONS (FR-12, in-app) =================
router.get('/notifications', requireAuth, asyncHandler(async (req, res) => {
  const list = (await db.find('notifications', { userId: req.user.id })).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 30);
  res.json({ notifications: list, unread: list.filter((n) => !n.read).length });
}));
router.post('/notifications/read-all', requireAuth, asyncHandler(async (req, res) => {
  for (const n of await db.find('notifications', { userId: req.user.id })) if (!n.read) await db.update('notifications', n.id, { read: true });
  res.json({ message: 'All caught up.' });
}));

// ================= USERS =================
router.patch('/users/me', requireAuth, asyncHandler(async (req, res) => {
  const name = clean(req.body.name, 80);
  if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  const user = await db.update('users', req.user.id, { name, phone: clean(req.body.phone, 30) });
  res.json({ user: publicUser(user), message: 'Profile saved.' });
}));

router.post('/users/me/password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!(await bcrypt.compare(String(currentPassword || ''), req.user.passwordHash))) throw new HttpError(400, 'Your current password is incorrect.');
  const issue = passwordProblem(newPassword);
  if (issue) throw new HttpError(400, issue);
  const user = await db.update('users', req.user.id, { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: (req.user.tokenVersion || 0) + 1 });
  require('../middleware/auth').setAuthCookie(res, user, false);
  res.json({ message: 'Password changed. Other devices have been signed out.' });
}));

router.get('/users/staff', requireStaff, asyncHandler(async (req, res) => {
  const staff = (await db.find('users', { role: 'staff' })).map((u) => ({ ...publicUser(u), active: u.active !== false, lastLoginAt: u.lastLoginAt || null }));
  const adopters = await db.count('users', { role: 'user' });
  res.json({ staff, adopterCount: adopters });
}));

router.post('/users/staff', requireStaff, asyncHandler(async (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  if (name.length < 2) throw new HttpError(400, 'Please enter the staff member\'s name.');
  if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (await db.findOne('users', { email })) throw new HttpError(409, 'Someone already uses this email.');
  const tempPassword = 'Paw' + crypto.randomBytes(4).toString('hex') + '9';
  const user = { id: newId('user'), name, email, passwordHash: await bcrypt.hash(tempPassword, 10), role: 'staff',
    emailVerified: true, tokenVersion: 0, active: true, createdAt: now() };
  await db.insert('users', user);
  await emails.staffInvite(user, tempPassword);
  res.status(201).json({ user: publicUser(user), message: `${name} was added and emailed their login details.` });
}));

router.patch('/users/staff/:id', requireStaff, asyncHandler(async (req, res) => {
  const target = await db.findOne('users', { id: req.params.id, role: 'staff' });
  if (!target) throw new HttpError(404, 'Staff member not found.');
  if (target.id === req.user.id) throw new HttpError(400, 'You cannot deactivate your own account.');
  const active = toBool(req.body.active);
  await db.update('users', target.id, { active, tokenVersion: (target.tokenVersion || 0) + 1 });
  res.json({ message: active ? `${target.name} can log in again.` : `${target.name} has been deactivated.` });
}));

// ================= CONTACT =================
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, message: { error: 'Too many messages. Please try again later.' } });
router.post('/contact', contactLimiter, asyncHandler(async (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const message = clean(req.body.message, 2000);
  if (name.length < 2 || !isEmail(email) || message.length < 10) throw new HttpError(400, 'Please add your name, a valid email and a message of at least 10 characters.');
  await db.insert('messages', { id: newId('msg'), name, email, message, at: now() });
  const staff = (await db.find('users', { role: 'staff' })).filter((u) => u.active !== false);
  const { escapeHtml } = require('../utils');
  for (const s of staff.slice(0, 5)) {
    sendMail({ to: s.email, type: 'contact', subject: `New message from ${name}`, heading: 'New contact form message',
      body: `<p><b>${escapeHtml(name)}</b> (${escapeHtml(email)}) wrote:</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>` }).catch(() => {});
  }
  res.json({ message: 'Thanks! Your message was sent to the shelter team.' });
}));

// ================= VETS (FR-11) =================
router.get('/vets', asyncHandler(async (req, res) => {
  try {
    res.json(await maps.findVets({ query: clean(req.query.q, 100), lat: req.query.lat, lng: req.query.lng }));
  } catch (err) {
    console.warn('Vet search failed:', err.message);
    res.json({ enabled: false, results: [], error: 'Live clinic search is unavailable right now — showing the map instead.' });
  }
}));

// ================= EVENTS (visitor counter for analytics) =================
const eventLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20 });
router.post('/events', eventLimiter, asyncHandler(async (req, res) => {
  if (req.body?.type === 'visit') await db.insert('events', { id: newId('evt'), type: 'visit', at: now() });
  res.status(204).end();
}));

// ================= SYSTEM =================
router.get('/config', (req, res) => res.json({
  aiMode: ai.aiEnabled ? 'openai' : 'built-in',
  emailMode: smtpEnabled ? 'smtp' : 'dev-mailbox',
  mapsMode: maps.mapsEnabled ? 'google-places' : 'google-embed',
  mapsEmbedKey: config.mapsKey || null, // public embed key — restrict it by website in Google Cloud
}));

router.get('/system/status', requireStaff, asyncHandler(async (req, res) => {
  const [pets, apps, users, mails] = await Promise.all([db.count('pets'), db.count('applications'), db.count('users'), db.count('emails')]);
  res.json({ database: db.name, email: smtpEnabled ? `SMTP (${config.smtp.host})` : 'Dev mailbox (no SMTP configured)',
    ai: ai.aiEnabled ? `OpenAI (${config.openaiModel})` : 'Built-in rule-based AI',
    maps: maps.mapsEnabled ? 'Google Places API' : 'Keyless Google Maps embed', counts: { pets, apps, users, mails },
    allowDemoReset: config.allowDemoReset });
}));

router.post('/system/reset', requireStaff, asyncHandler(async (req, res) => {
  if (!config.allowDemoReset) throw new HttpError(403, 'Demo reset is turned off on this server.');
  await seedIfEmpty({ force: true });
  res.json({ message: 'All data was reset to the sample data. Please log in again.' });
}));

// Dev mailbox — only available when no real SMTP server is configured
router.get('/dev/emails', asyncHandler(async (req, res) => {
  if (smtpEnabled || config.isProd) throw new HttpError(404, 'Not available.'); // never expose reset/verify links in production
  let list = (await db.find('emails')).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  const to = clean(req.query.to, 120).toLowerCase();
  if (to) list = list.filter((m) => m.to.toLowerCase() === to);
  res.json({ emails: list.slice(0, 50) });
}));

module.exports = router;
