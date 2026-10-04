// Analytics, notifications, account profile, public stats/FAQ, contact, vets, events and system endpoints.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const ai = require('../services/ai');
const llm = require('../services/llm');
const maps = require('../services/maps');
const { sendMail, emailMode } = require('../services/mailer');
const { smsMode } = require('../services/sms');
const { seedIfEmpty } = require('../services/seed');
const { sanitizeProfile, describeProfile, emptyProfile, AGE_BAND } = require('../services/matching');
const { FAQ, APPLICATION_QUESTIONS } = require('../services/knowledge');
const { requireAuth, requireStaff, requireAdmin, publicUser, shelterScope, setAuthCookie } = require('../middleware/auth');
const { APP_CLOSED, APP_STATUSES } = require('../constants');
const { newId, now, asyncHandler, clean, toInt, isEmail, passwordProblem, HttpError, escapeHtml } = require('../utils');

const router = express.Router();

// ================= PUBLIC: stats, FAQ, shelters =================
router.get('/stats/public', asyncHandler(async (req, res) => {
  const [pets, shelters] = await Promise.all([db.find('pets'), db.find('shelters')]);
  res.json({ availablePets: pets.filter((p) => p.status === 'Available').length,
    adoptedPets: pets.filter((p) => p.status === 'Adopted').length,
    shelters: shelters.length, species: new Set(pets.filter((p) => ['Available', 'On Hold'].includes(p.status)).map((p) => p.type)).size });
}));

router.get('/faq', (req, res) => res.json({ faq: FAQ.map(({ id, q, a }) => ({ id, q, a })), questions: APPLICATION_QUESTIONS }));

router.get('/shelters', asyncHandler(async (req, res) => {
  const shelters = await db.find('shelters');
  res.json({ shelters: shelters.map((s) => ({ id: s.id, name: s.name, suburb: s.suburb, state: s.state, address: s.address, phone: s.phone, email: s.email, hours: s.hours, website: config.appUrl })) });
}));

// ================= ANALYTICS (staff, scoped to their shelter) =================
const inRange = (iso, from, to) => { const t = new Date(iso).getTime(); return t >= from && t <= to; };
function parseRange(q) {
  const to = q.to ? new Date(q.to + 'T23:59:59') : new Date();
  const from = q.from ? new Date(q.from + 'T00:00:00') : new Date(to.getTime() - 29 * 86400000);
  return { from: from.getTime(), to: to.getTime() };
}
const pctChange = (cur, prev) => (prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 1000) / 10);
const adoptedAt = (a) => a.history?.find((h) => h.status === 'Adopted')?.at;

async function scopedData(req) {
  const scope = shelterScope(req);
  const within = (list) => (scope ? list.filter((x) => x.shelterId === scope) : list);
  const [pets, apps, enquiries, favs, events, searches, mails] = await Promise.all([db.find('pets'), db.find('applications'),
    db.find('enquiries'), db.find('favourites'), db.find('events'), db.find('searches'), db.find('emails')]);
  const myPets = within(pets);
  const petIds = new Set(myPets.map((p) => p.id));
  return { pets: myPets, apps: within(apps), enquiries: within(enquiries), favs: favs.filter((f) => petIds.has(f.petId)),
    views: events.filter((e) => e.type === 'pet_view' && petIds.has(e.petId)), events, searches, mails };
}

router.get('/analytics/dashboard', requireStaff, asyncHandler(async (req, res) => {
  const { pets, apps, enquiries, mails } = await scopedData(req);
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const adoptedThis = apps.filter((a) => a.status === 'Adopted' && new Date(adoptedAt(a)).getTime() >= monthStart).length;
  const adoptedPrev = apps.filter((a) => { const t = new Date(adoptedAt(a)).getTime(); return a.status === 'Adopted' && t >= prevStart && t < monthStart; }).length;
  const newThis = apps.filter((a) => new Date(a.submittedAt).getTime() >= monthStart).length;
  const newPrev = apps.filter((a) => { const t = new Date(a.submittedAt).getTime(); return t >= prevStart && t < monthStart; }).length;
  const sent = mails.filter((m) => m.status === 'sent').length;
  res.json({
    availablePets: pets.filter((p) => p.status === 'Available').length,
    onHoldPets: pets.filter((p) => p.status === 'On Hold').length,
    draftPets: pets.filter((p) => p.status === 'Draft').length,
    newPetsThisMonth: pets.filter((p) => new Date(p.createdAt).getTime() >= monthStart).length,
    openApplications: apps.filter((a) => !APP_CLOSED.includes(a.status)).length,
    newApplicationsThisMonth: newThis, newApplicationsChange: pctChange(newThis, newPrev),
    adoptedThisMonth: adoptedThis, adoptedChange: pctChange(adoptedThis, adoptedPrev),
    openEnquiries: enquiries.filter((e) => e.status === 'Open').length,
    emailSuccessRate: mails.length ? Math.round((sent / mails.length) * 100) : 100, emailsSent: mails.length,
    pendingReview: apps.filter((a) => ['Submitted', 'Under Review'].includes(a.status)).length,
    pipeline: APP_STATUSES.filter((s) => !['Withdrawn'].includes(s)).map((s) => ({ status: s, count: apps.filter((a) => a.status === s).length })),
    upcoming: apps.filter((a) => a.appointmentAt && !APP_CLOSED.includes(a.status) && new Date(a.appointmentAt) > new Date())
      .sort((a, b) => new Date(a.appointmentAt) - new Date(b.appointmentAt)).slice(0, 5)
      .map((a) => ({ id: a.id, name: a.name, petName: a.petName, status: a.status, appointmentAt: a.appointmentAt })),
    recent: [...apps].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 6)
      .map((a) => ({ id: a.id, name: a.name, petName: a.petName, petPhoto: a.petPhoto, status: a.status, score: a.score, submittedAt: a.submittedAt })),
  });
}));

function buildAnalytics(data, from, to) {
  const { pets, apps, enquiries, favs, views, events, searches } = data;
  const span = to - from;
  const R = (list, key) => list.filter((x) => inRange(x[key], from, to));
  const P = (list, key) => list.filter((x) => inRange(x[key], from - span, from - 1));
  const appsIn = R(apps, 'submittedAt'); const enqIn = R(enquiries, 'at'); const viewsIn = R(views, 'at'); const favsIn = R(favs, 'at');
  const searchesIn = R(searches, 'at'); const visitsIn = events.filter((e) => e.type === 'visit' && inRange(e.at, from, to));
  const adoptionsIn = apps.filter((a) => a.status === 'Adopted' && inRange(adoptedAt(a), from, to));
  const prevAdoptions = apps.filter((a) => a.status === 'Adopted' && inRange(adoptedAt(a), from - span, from - 1)).length;

  // Funnel: views → enquiries → applications → approved (or further) → adopted
  const reachedApproved = appsIn.filter((a) => a.history?.some((h) => ['Approved', 'Adoption Scheduled', 'Adopted'].includes(h.status))).length;
  const funnel = [
    { stage: 'Profile views', count: viewsIn.length }, { stage: 'Enquiries', count: enqIn.length },
    { stage: 'Applications', count: appsIn.length }, { stage: 'Approved', count: reachedApproved },
    { stage: 'Adopted', count: appsIn.filter((a) => a.status === 'Adopted').length },
  ];

  // Processing time: submitted → first staff action, and submitted → final decision
  const firstAction = apps.map((a) => { const h = (a.history || []).find((x, i) => i > 0 && x.by !== 'Applicant'); return h ? (new Date(h.at) - new Date(a.submittedAt)) / 86400000 : null; }).filter((x) => x !== null && x >= 0);
  const toDecision = apps.filter((a) => ['Adopted', 'Declined'].includes(a.status)).map((a) => (new Date(a.history[a.history.length - 1].at) - new Date(a.submittedAt)) / 86400000).filter((x) => x >= 0);
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : null);

  // Interest by characteristic
  const petById = new Map(pets.map((p) => [p.id, p]));
  const interestBy = (fn) => {
    const m = {};
    const bump = (petId, n) => { const p = petById.get(petId); if (!p) return; const k = fn(p); m[k] ||= { key: k, enquiries: 0, applications: 0, favourites: 0, views: 0, pets: 0 }; m[k][n]++; };
    enqIn.forEach((e) => bump(e.petId, 'enquiries')); appsIn.forEach((a) => bump(a.petId, 'applications'));
    favsIn.forEach((f) => bump(f.petId, 'favourites')); viewsIn.forEach((v) => bump(v.petId, 'views'));
    pets.filter((p) => ['Available', 'On Hold'].includes(p.status)).forEach((p) => { const k = fn(p); m[k] ||= { key: k, enquiries: 0, applications: 0, favourites: 0, views: 0, pets: 0 }; m[k].pets++; });
    return Object.values(m).map((x) => ({ ...x, interest: x.enquiries + x.applications * 2 + x.favourites + Math.round(x.views / 5) })).sort((a, b) => b.interest - a.interest);
  };
  const ageLabel = { baby: 'Under 1', young: '1–2 years', adult: '3–7 years', senior: '8+ years' };
  const byAge = interestBy((p) => ageLabel[AGE_BAND(p.age)]);
  const byType = interestBy((p) => p.type);
  const bySize = interestBy((p) => p.size);

  const count = (list, key) => list.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {});
  const kw = count(searchesIn, 'keyword'); const zero = count(searchesIn.filter((s) => s.results === 0), 'keyword');
  const buckets = [];
  for (let start = from; start <= to; start += 7 * 86400000) buckets.push({ start, end: Math.min(start + 7 * 86400000 - 1, to) });
  const trend = buckets.map((b) => ({
    label: new Date(b.start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    applications: apps.filter((a) => inRange(a.submittedAt, b.start, b.end)).length,
    enquiries: enquiries.filter((e) => inRange(e.at, b.start, b.end)).length,
    adoptions: apps.filter((a) => a.status === 'Adopted' && inRange(adoptedAt(a), b.start, b.end)).length,
    aiMatches: events.filter((e) => ['ai_match', 'ai_chat'].includes(e.type) && inRange(e.at, b.start, b.end)).length,
  }));
  const complete = appsIn.filter((a) => [!a.phone, !a.address, !a.experienceDetails, !a.workSchedule].filter(Boolean).length < 2).length;

  const stats = {
    activePets: pets.filter((p) => ['Available', 'On Hold'].includes(p.status)).length,
    adoptedPets: pets.filter((p) => p.status === 'Adopted').length,
    applications: appsIn.length, applicationsChange: pctChange(appsIn.length, P(apps, 'submittedAt').length),
    enquiries: enqIn.length, enquiriesChange: pctChange(enqIn.length, P(enquiries, 'at').length),
    views: viewsIn.length, viewsChange: pctChange(viewsIn.length, P(views, 'at').length),
    favourites: favsIn.length,
    adoptions: adoptionsIn.length, adoptionsChange: pctChange(adoptionsIn.length, prevAdoptions),
    visitors: visitsIn.length, searches: searchesIn.length,
    aiSessions: events.filter((e) => ['ai_match', 'ai_chat'].includes(e.type) && inRange(e.at, from, to)).length,
    completionRate: appsIn.length ? Math.round((complete / appsIn.length) * 100) : null,
    avgDaysToFirstAction: avg(firstAction), avgDaysToDecision: avg(toDecision),
    averageScore: appsIn.length ? Math.round(appsIn.reduce((t, a) => t + (a.score || 0), 0) / appsIn.length) : null,
  };
  return { stats, funnel, byAge, byType, bySize, trend,
    topKeywords: Object.entries(kw).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([keyword, n]) => ({ keyword, count: n })),
    zeroResultKeywords: Object.entries(zero).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([keyword, n]) => ({ keyword, count: n })),
    statusCounts: APP_STATUSES.map((s) => ({ status: s, count: appsIn.filter((a) => a.status === s).length })) };
}

// Plain-language insights computed from the numbers (the model only rewords these facts when configured)
function ruleInsights(a) {
  const out = [];
  const s = a.stats;
  const topAge = a.byAge.find((x) => x.interest > 0);
  if (topAge) {
    const perPet = (x) => (x.pets ? x.interest / x.pets : x.interest);
    const best = [...a.byAge].filter((x) => x.pets).sort((x, y) => perPet(y) - perPet(x))[0];
    out.push(`Pets aged ${(best || topAge).key.toLowerCase()} drew the most interest per pet this period (${(best || topAge).enquiries} enquiries, ${(best || topAge).applications} applications).`);
  }
  const topType = a.byType.find((x) => x.interest > 0);
  if (topType) out.push(`${topType.key}s received ${topType.applications} application${topType.applications === 1 ? '' : 's'} and ${topType.enquiries} enquir${topType.enquiries === 1 ? 'y' : 'ies'} — the most of any species.`);
  const views = a.funnel[0].count; const apps = a.funnel[2].count;
  if (views && apps) out.push(`About ${Math.round((apps / views) * 1000) / 10}% of pet profile views turned into an application.`);
  if (s.applicationsChange && Math.abs(s.applicationsChange) >= 10) out.push(`Applications are ${s.applicationsChange > 0 ? 'up' : 'down'} ${Math.abs(s.applicationsChange)}% on the previous period.`);
  if (s.avgDaysToFirstAction !== null) out.push(`Applications waited an average of ${s.avgDaysToFirstAction} days for their first review step.`);
  if (a.zeroResultKeywords.length) out.push(`Adopters searched for "${a.zeroResultKeywords[0].keyword}" ${a.zeroResultKeywords[0].count} time${a.zeroResultKeywords[0].count === 1 ? '' : 's'} with no results — a possible gap in listings.`);
  if (s.completionRate !== null && s.completionRate < 70) out.push(`Only ${s.completionRate}% of applications were complete — consider asking for missing details early.`);
  return out.slice(0, 5);
}

router.get('/analytics', requireStaff, asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const result = buildAnalytics(await scopedData(req), from, to);
  res.json({ range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, ...result });
}));

router.get('/analytics/insights', requireStaff, asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const a = buildAnalytics(await scopedData(req), from, to);
  const facts = ruleInsights(a);
  const result = await ai.insights({ period: { from: new Date(from).toISOString().slice(0, 10), to: new Date(to).toISOString().slice(0, 10) },
    stats: a.stats, funnel: a.funnel, byAge: a.byAge, byType: a.byType, bySize: a.bySize, zeroResultSearches: a.zeroResultKeywords }, facts);
  res.json(result);
}));

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
router.get('/analytics/export', requireStaff, asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.query);
  const data = await scopedData(req);
  const type = req.query.type === 'searches' ? 'searches' : 'applications';
  const rows = type === 'searches'
    ? [['Keyword', 'Results', 'Date']].concat(data.searches.filter((s) => inRange(s.at, from, to)).map((s) => [s.keyword, s.results, s.at]))
    : [['Applicant', 'Email', 'Pet', 'Suitability score', 'Match', 'Status', 'Living', 'Experience', 'Submitted']]
      .concat(data.apps.filter((a) => inRange(a.submittedAt, from, to)).map((a) => [a.name, a.email, a.petName, a.score, a.label, a.status, a.livingType, a.experience, a.submittedAt]));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pawpal-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(rows.map((r) => r.map(csvCell).join(',')).join('\n'));
}));

// ================= NOTIFICATIONS =================
router.get('/notifications', requireAuth, asyncHandler(async (req, res) => {
  const all = (await db.find('notifications', { userId: req.user.id })).sort((a, b) => new Date(b.at) - new Date(a.at));
  const limit = toInt(req.query.limit, 1, 200, 30);
  res.json({ notifications: all.slice(0, limit), unread: all.filter((n) => !n.read).length, total: all.length });
}));
router.post('/notifications/read-all', requireAuth, asyncHandler(async (req, res) => {
  for (const n of await db.find('notifications', { userId: req.user.id })) if (!n.read) await db.update('notifications', n.id, { read: true });
  res.json({ message: 'All caught up.' });
}));
router.post('/notifications/:id/read', requireAuth, asyncHandler(async (req, res) => {
  const n = await db.findOne('notifications', { id: req.params.id });
  if (!n || n.userId !== req.user.id) throw new HttpError(404, 'Notification not found.');
  await db.update('notifications', n.id, { read: true });
  res.json({ ok: true });
}));

// ================= ACCOUNT =================
router.patch('/users/me', requireAuth, asyncHandler(async (req, res) => {
  const patch = {};
  if (req.body.name !== undefined) {
    const name = clean(req.body.name, 80);
    if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
    patch.name = name;
  }
  if (req.body.phone !== undefined) {
    const phone = clean(req.body.phone, 30);
    if (phone !== (req.user.phone || '')) { patch.phone = phone; patch.phoneVerified = false; }
  }
  if (req.body.address !== undefined) patch.address = clean(req.body.address, 160);
  if (req.body.preferences !== undefined) patch.preferences = req.body.preferences ? sanitizeProfile(req.body.preferences, emptyProfile()) : null;
  // Email settings: adopters choose application emails, staff choose shelter-activity emails (in-app notifications always happen)
  if (req.body.emailPrefs !== undefined) {
    const ep = req.body.emailPrefs;
    if (!ep || typeof ep !== 'object' || Array.isArray(ep)) throw new HttpError(400, 'Email settings are invalid.');
    const current = { applications: req.user.emailPrefs?.applications !== false, activity: req.user.emailPrefs?.activity !== false };
    for (const key of ['applications', 'activity']) {
      if (ep[key] === undefined) continue;
      if (typeof ep[key] !== 'boolean') throw new HttpError(400, 'Email settings must be on or off.');
      current[key] = ep[key];
    }
    patch.emailPrefs = current;
  }
  const user = await db.update('users', req.user.id, patch);
  res.json({ user: { ...publicUser(user), address: user.address || '' }, understood: user.preferences ? describeProfile(user.preferences) : [], message: 'Profile saved.' });
}));

router.get('/users/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: { ...publicUser(req.user), address: req.user.address || '' }, understood: req.user.preferences ? describeProfile(req.user.preferences) : [], preferencesText: req.user.preferencesText || '' });
}));

router.post('/users/me/password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!(await bcrypt.compare(String(currentPassword || ''), req.user.passwordHash))) throw new HttpError(400, 'Your current password is incorrect.');
  const issue = passwordProblem(newPassword);
  if (issue) throw new HttpError(400, issue);
  const user = await db.update('users', req.user.id, { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: (req.user.tokenVersion || 0) + 1 });
  setAuthCookie(res, user, false);
  res.json({ message: 'Password changed. Other devices have been signed out.' });
}));

// Staff see their own team; admins manage everyone via /api/admin
router.get('/users/staff', requireStaff, asyncHandler(async (req, res) => {
  const scope = shelterScope(req);
  const staff = (await db.find('users')).filter((u) => ['staff', 'admin'].includes(u.role) && (!scope || u.shelterId === scope || u.role === 'admin'))
    .map((u) => ({ ...publicUser(u), active: u.active !== false, lastLoginAt: u.lastLoginAt || null }));
  res.json({ staff, adopterCount: await db.count('users', { role: 'user' }) });
}));

// ================= CONTACT =================
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, message: { error: 'Too many messages. Please try again later.' } });
router.post('/contact', contactLimiter, asyncHandler(async (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const message = clean(req.body.message, 2000);
  const topic = clean(req.body.topic, 60);
  if (name.length < 2 || !isEmail(email) || message.length < 10) throw new HttpError(400, 'Please add your name, a valid email and a message of at least 10 characters.');
  await db.insert('messages', { id: newId('msg'), name, email, topic, message, at: now() });
  const staff = (await db.find('users')).filter((u) => u.role === 'admin' && u.active !== false);
  for (const s of staff.slice(0, 5)) {
    sendMail({ to: s.email, type: 'contact', subject: `New message from ${name}${topic ? ` (${topic})` : ''}`, heading: 'New contact form message',
      body: `<p><b>${escapeHtml(name)}</b> (${escapeHtml(email)}) wrote:</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>` }).catch(() => {});
  }
  res.json({ message: 'Thanks! Your message was sent to the PawPal team.' });
}));

// ================= VETS =================
router.get('/vets', asyncHandler(async (req, res) => {
  try {
    res.json(await maps.findVets({ query: clean(req.query.q, 100), lat: req.query.lat, lng: req.query.lng }));
  } catch (err) {
    console.warn('Vet search failed:', err.message);
    res.json({ enabled: false, results: [], error: 'Live clinic search is unavailable right now — showing the map instead.' });
  }
}));

// ================= EVENTS (anonymous visit counter for analytics) =================
const eventLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
router.post('/events', eventLimiter, asyncHandler(async (req, res) => {
  if (req.body?.type === 'visit') await db.insert('events', { id: newId('evt'), type: 'visit', at: now() });
  res.status(204).end();
}));

// ================= SYSTEM =================
router.get('/config', (req, res) => res.json({
  aiMode: llm.llmEnabled ? llm.provider : 'rules', aiLabel: llm.providerLabel,
  emailMode, smsMode, mapsMode: maps.mapsEnabled ? 'google-places' : 'google-embed',
  mapsEmbedKey: config.mapsKey || null, defaultCountryCode: config.defaultCountryCode,
  contactEmail: config.contactEmail, siteUrl: config.appUrl,
}));

router.get('/system/status', requireAdmin, asyncHandler(async (req, res) => {
  const [pets, apps, users, mails, shelters] = await Promise.all([db.count('pets'), db.count('applications'), db.count('users'), db.count('emails'), db.count('shelters')]);
  res.json({ database: db.name,
    email: { gmail: `Gmail API (from ${config.gmail.sender})`, resend: `Resend API (from ${config.mailFrom})`, brevo: `Brevo API (from ${config.mailFrom})`, smtp: `SMTP (${config.smtp.host})`, dev: 'Dev mailbox (no email provider configured)' }[emailMode],
    sms: { twilio: 'Twilio', dev: 'Dev SMS log (no SMS provider configured)', disabled: 'Not configured' }[smsMode],
    ai: llm.providerLabel, maps: maps.mapsEnabled ? 'Google Places API' : 'Keyless Google Maps embed',
    counts: { pets, apps, users, mails, shelters }, allowDemoReset: config.allowDemoReset,
    // The last emails PawPal tried to send, so delivery problems can be seen without the server logs
    recentEmails: (await db.find('emails')).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)).slice(0, 20)
      .map((m) => ({ to: m.to, type: m.type, subject: m.subject, status: m.status, error: m.error || null, mode: m.mode, retried: !!m.retried, sentAt: m.sentAt })) });
}));

router.post('/system/reset', requireAdmin, asyncHandler(async (req, res) => {
  if (!config.allowDemoReset) throw new HttpError(403, 'Demo reset is turned off on this server.');
  await seedIfEmpty({ force: true });
  await require('../services/bootstrap').ensureOwnerAdmin(); // keep the owner's administrator account
  res.json({ message: 'All data was reset to the sample data. Please log in again.' });
}));

// Dev mailbox + SMS log — only when no real provider is configured and never in production
router.get('/dev/emails', asyncHandler(async (req, res) => {
  if (emailMode !== 'dev' || config.isProd) throw new HttpError(404, 'Not available.');
  let list = (await db.find('emails')).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  const to = clean(req.query.to, 120).toLowerCase();
  if (to) list = list.filter((m) => m.to.toLowerCase() === to);
  res.json({ emails: list.slice(0, 50) });
}));
router.get('/dev/sms', asyncHandler(async (req, res) => {
  if (smsMode !== 'dev' || config.isProd) throw new HttpError(404, 'Not available.');
  res.json({ messages: (await db.find('sms')).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)).slice(0, 30) });
}));

module.exports = router;
