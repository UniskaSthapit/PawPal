// AI endpoints: matching, natural-language search, chat assistant (with saved conversations),
// application question help, pet descriptions, shelter assistant and application summaries.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const ai = require('../services/ai');
const { describeProfile, evaluateMatch, rankPets, sanitizeProfile, profileIsEmpty, emptyProfile, parseProfile } = require('../services/matching');
const { requireAuth, requireStaff, isStaff, shelterScope, inScope } = require('../middleware/auth');
const { toPublic, applyFilters, keywordFilter, publicPets } = require('./pets');
const { missingSections } = require('./applications');
const { APP_CLOSED, APP_NEEDS_DATE } = require('../constants');
const { newId, now, asyncHandler, clean, toBool, toInt, HttpError } = require('../utils');
const crypto = require('crypto');
const config = require('../config');

const router = express.Router();
// Counted per signed-in person (per IP address for visitors), so colleagues on the same shelter network don't share a limit
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : rateLimit.ipKeyGenerator(req.ip)),
  skip: (req) => req.path === '/translate', // has its own limit below, so translating chat replies doesn't use up the chat limit
  message: { error: 'You\'re sending messages quickly — please wait a moment and try again.' } });
router.use(aiLimiter);

const shapeMatch = (m) => ({ pet: toPublic(m.pet), match: m.score, score: m.score, reasons: m.reasons, considerations: m.considerations, summary: m.summary });

// Structured quiz answers → profile fields
function answersToProfile(b = {}) {
  const p = {};
  if (['apartment', 'house', 'farm'].includes(b.homeType)) { p.homeType = b.homeType; p.hasYard = b.homeType === 'farm' ? true : b.hasYard !== undefined ? toBool(b.hasYard) : b.homeType === 'house' ? true : false; }
  if (b.activity !== undefined && b.activity !== '') p.activity = toInt(b.activity, 1, 3, 2);
  if (b.hasChildren !== undefined && b.hasChildren !== '') p.hasChildren = toBool(b.hasChildren);
  if (b.hasOtherPets !== undefined && b.hasOtherPets !== '') p.hasOtherPets = toBool(b.hasOtherPets);
  if (b.hoursAlone !== undefined && b.hoursAlone !== '') p.hoursAlone = toInt(b.hoursAlone, 0, 24, 4);
  if (['dog', 'cat', 'other', 'any'].includes(b.preferredType)) p.preferredType = b.preferredType;
  if (['first', 'some', 'experienced'].includes(b.experience)) p.experience = b.experience;
  if (Array.isArray(b.size)) p.size = b.size;
  if (Array.isArray(b.age)) p.age = b.age;
  return p;
}

// Favourites nudge recommendations: if no species was stated, lean towards what they've saved
async function favouriteHint(userId, profile) {
  if (!userId || profile.preferredType) return null;
  const favs = await db.find('favourites', { userId });
  if (favs.length < 2) return null;
  const pets = (await Promise.all(favs.map((f) => db.findOne('pets', { id: f.petId })))).filter(Boolean);
  const counts = pets.reduce((m, p) => ((m[p.type] = (m[p.type] || 0) + 1), m), {});
  const [type, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  if (type && n / pets.length >= 0.7) return ['Dog', 'Cat'].includes(type) ? type.toLowerCase() : 'other';
  return null;
}

// ---- Matching: "Tell PawPal about yourself" ----
router.post('/match', asyncHandler(async (req, res) => {
  const text = clean(req.body?.text, 2000);
  const pets = await publicPets();
  const locations = [...new Set(pets.map((p) => p.location).filter(Boolean))];
  const base = sanitizeProfile(answersToProfile(req.body), emptyProfile());
  // The home page's live example uses the rules engine only: no model call and no analytics event per page view
  const demo = toBool(req.body?.demo);
  const { profile, source: readSource } = demo ? { profile: parseProfile(text, base, locations), source: 'rules' } : await ai.understandLifestyle(text, base, locations);
  const understood = describeProfile(profile);
  if (!text && profileIsEmpty(profile)) throw new HttpError(400, 'Tell PawPal a little about your home and lifestyle first.');
  const userId = req.user?.role === 'user' ? req.user.id : null;
  const hint = await favouriteHint(userId, profile);
  if (hint) { profile.preferredType = hint; understood.push(`Leaning towards ${hint === 'other' ? 'small pets' : hint + 's'} (from your saved favourites)`); }

  const ranked = rankPets(pets, profile, toInt(req.body.limit, 1, 12, 6));
  const { matches, source } = demo ? { matches: ranked.map((m) => ({ ...m, summary: m.reasons[0] || '' })), source: 'rules' } : await ai.explainMatches(profile, ranked);
  if (userId && !demo) {
    await db.update('users', userId, { preferences: profile, preferencesText: text || null, preferencesAt: now() });
    await db.insert('matches', { id: newId('match'), userId, profile, text, results: matches.map((m) => ({ petId: m.pet.id, score: m.score })), at: now() });
  }
  if (!demo) await db.insert('events', { id: newId('evt'), type: 'ai_match', at: now() });
  res.json({ profile, understood, matches: matches.map(shapeMatch), source: source === 'rules' && readSource !== 'rules' ? readSource : source, saved: Boolean(userId) });
}));

// ---- Personalised recommendations from the saved lifestyle profile (always re-ranked on live data) ----
router.get('/recommendations', requireAuth, asyncHandler(async (req, res) => {
  const profile = req.user.preferences;
  if (!profile || profileIsEmpty(profile)) return res.json({ matches: [], understood: [], hasProfile: false });
  const ranked = rankPets(await publicPets(), profile, toInt(req.query.limit, 1, 12, 4));
  res.json({ matches: ranked.map((m) => shapeMatch({ ...m, summary: m.reasons[0] || '' })), understood: describeProfile(profile), hasProfile: true, text: req.user.preferencesText || '' });
}));

// ---- Compatibility of one pet with the signed-in adopter's saved lifestyle ----
router.get('/compatibility/:petId', requireAuth, asyncHandler(async (req, res) => {
  const pet = await db.findOne('pets', { id: req.params.petId });
  if (!pet || !['Available', 'On Hold'].includes(pet.status)) throw new HttpError(404, 'Pet not found.');
  const profile = req.user.preferences;
  if (!profile || profileIsEmpty(profile)) return res.json({ hasProfile: false });
  res.json({ hasProfile: true, ...evaluateMatch(pet, profile), understood: describeProfile(profile) });
}));

// ---- Natural language search ----
router.post('/search', asyncHandler(async (req, res) => {
  const query = clean(req.body?.query, 300);
  if (query.length < 2) throw new HttpError(400, 'Type what you\'re looking for.');
  const all = await publicPets();
  const locations = [...new Set(all.map((p) => p.location).filter(Boolean))];
  const { profile, source } = await ai.understandLifestyle(query, {}, locations);
  const filters = ai.profileToFilters(profile);
  // Breed or name words in the query ("beagle", "Luna") narrow the search further
  const q = query.toLowerCase();
  const breed = [...new Set(all.map((p) => p.breed))].find((b) => q.includes(b.toLowerCase()) || b.toLowerCase().split(' ').some((w) => w.length > 4 && q.includes(w)));
  if (breed) filters.breed = breed.toLowerCase().split(' ').find((w) => w.length > 4 && q.includes(w)) || breed.toLowerCase();
  const named = all.filter((p) => new RegExp(`\\b${p.name.toLowerCase()}\\b`).test(q));

  let results = named.length ? named : applyFilters(all, filters);
  const relaxed = [];
  // If nothing fits, relax the least important criteria one at a time and say so
  for (const key of ['age', 'size', 'location', 'firstTime', 'breed', 'energy']) {
    if (results.length || named.length) break;
    if ((Array.isArray(filters[key]) ? filters[key].length : filters[key])) {
      filters[key] = Array.isArray(filters[key]) ? [] : key === 'breed' || key === 'location' ? '' : false;
      relaxed.push(key);
      results = applyFilters(all, filters);
    }
  }
  if (!results.length && profileIsEmpty(profile)) results = keywordFilter(all, q);
  const scored = results.map((pet) => ({ pet, ...evaluateMatch(pet, profile) })).sort((a, b) => b.score - a.score);
  const interpretation = named.length ? `Showing ${named.map((p) => p.name).join(', ')}` : `Showing ${ai.describeFilters(filters)}`;
  if (!isStaff(req)) await db.insert('searches', { id: newId('srch'), keyword: q.slice(0, 80), results: scored.length, natural: true, at: now() });
  res.json({ interpretation, understood: describeProfile(profile), relaxed, profile, filters,
    results: scored.map((m) => ({ ...shapeMatch(m), summary: m.reasons[0] || '' })), total: scored.length, source });
}));

// ---- Chat assistant ----
router.post('/chat', asyncHandler(async (req, res) => {
  const message = clean(req.body?.message, 800);
  if (!message) throw new HttpError(400, 'Type a message first.');
  const pets = await publicPets();
  const shelters = Object.fromEntries((await db.find('shelters')).map((s) => [s.id, s]));
  const user = req.user || null;
  const adopter = user?.role === 'user';

  let convo = null;
  if (adopter && req.body.conversationId) {
    convo = await db.findOne('conversations', { id: clean(req.body.conversationId, 40) });
    if (convo && convo.userId !== user.id) convo = null;
  }
  const history = convo ? convo.messages.map((m) => ({ role: m.role, content: m.content }))
    : (Array.isArray(req.body.history) ? req.body.history.slice(-10) : []).map((m) => ({ role: m?.role === 'user' ? 'user' : 'assistant', content: clean(String(m?.content || ''), 800) }));
  const prevProfile = sanitizeProfile(convo?.profile || (typeof req.body.profile === 'object' && req.body.profile) || (adopter && user.preferences) || {}, emptyProfile());
  const applications = adopter ? (await db.find('applications', { userId: user.id })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)) : [];
  const lastPetIds = (Array.isArray(req.body.lastPetIds) ? req.body.lastPetIds : []).map((x) => clean(String(x), 40)).slice(0, 3);

  const result = await ai.chat({ message, history, prevProfile, pets, applications, user, lastPetIds, shelters });
  const picks = result.picks.map((m) => ({ pet: toPublic(m.pet), match: m.score, reasons: m.reasons, considerations: m.considerations }));

  if (adopter) {
    const at = now();
    const turn = [{ role: 'user', content: message, at }, { role: 'assistant', content: result.reply, petIds: picks.map((p) => p.pet.id), at }];
    if (convo) convo = await db.update('conversations', convo.id, { messages: [...convo.messages, ...turn].slice(-60), profile: result.profile, updatedAt: at });
    else {
      convo = { id: newId('conv'), userId: user.id, title: message.slice(0, 60), messages: turn, profile: result.profile, createdAt: at, updatedAt: at };
      await db.insert('conversations', convo);
    }
  }
  await db.insert('events', { id: newId('evt'), type: 'ai_chat', at: now() });
  res.json({ reply: result.reply, picks, actions: result.actions || [], understood: describeProfile(result.profile), profile: result.profile,
    conversationId: convo?.id || null, source: result.source });
}));

router.get('/conversations', requireAuth, asyncHandler(async (req, res) => {
  const list = (await db.find('conversations', { userId: req.user.id })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ conversations: list.slice(0, 20).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, count: c.messages.length })) });
}));

router.get('/conversations/:id', requireAuth, asyncHandler(async (req, res) => {
  const c = await db.findOne('conversations', { id: req.params.id });
  if (!c || c.userId !== req.user.id) throw new HttpError(404, 'Conversation not found.');
  const ids = [...new Set(c.messages.flatMap((m) => m.petIds || []))];
  const pets = (await Promise.all(ids.map((id) => db.findOne('pets', { id })))).filter((p) => p && ['Available', 'On Hold', 'Adopted'].includes(p.status)).map(toPublic);
  res.json({ conversation: { id: c.id, title: c.title, messages: c.messages, updatedAt: c.updatedAt }, pets });
}));

router.delete('/conversations/:id', requireAuth, asyncHandler(async (req, res) => {
  const c = await db.findOne('conversations', { id: req.params.id });
  if (!c || c.userId !== req.user.id) throw new HttpError(404, 'Conversation not found.');
  await db.remove('conversations', c.id);
  res.json({ message: 'Conversation deleted.' });
}));

// ---- Application question helper (explains; never answers for the adopter) ----
router.post('/explain-question', asyncHandler(async (req, res) => {
  const result = await ai.explainQuestion(clean(req.body?.key, 40), clean(req.body?.question, 400));
  if (!result) throw new HttpError(404, 'Unknown question.');
  res.json(result);
}));

// ---- Staff: pet description ----
router.post('/describe', requireStaff, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const pet = { name: clean(b.name, 40), type: clean(b.type, 20), breed: clean(b.breed, 60), age: toInt(b.age, 0, 30, 0),
    gender: clean(b.gender, 10), size: clean(b.size, 10), energyLevel: toInt(b.energyLevel, 1, 3, 2), idealHome: clean(b.idealHome, 400),
    traits: (Array.isArray(b.traits) ? b.traits : String(b.traits || '').split(',')).map((t) => clean(String(t), 30)).filter(Boolean),
    goodWithChildren: toBool(b.goodWithChildren), goodWithOtherPets: toBool(b.goodWithOtherPets), requiresYard: toBool(b.requiresYard) };
  if (!pet.name || !pet.breed) throw new HttpError(400, 'Add at least the pet\'s name and breed first.');
  const result = await ai.describePet(pet); // internal notes are never passed in
  res.json({ description: result.text, source: result.source });
}));

// ---- Staff: shelter assistant ----
async function shelterSnapshot(req) {
  const scope = shelterScope(req);
  const within = (list) => (scope ? list.filter((x) => x.shelterId === scope) : list);
  const [pets, apps, enquiries, favs, events] = await Promise.all([db.find('pets'), db.find('applications'), db.find('enquiries'), db.find('favourites'), db.find('events')]);
  const myPets = within(pets); const myApps = within(apps); const myEnq = within(enquiries);
  const open = myApps.filter((a) => !APP_CLOSED.includes(a.status));
  const views = events.filter((e) => e.type === 'pet_view').reduce((m, e) => ((m[e.petId] = (m[e.petId] || 0) + 1), m), {});
  const petInterest = myPets.filter((p) => ['Available', 'On Hold'].includes(p.status)).map((p) => {
    const enquiriesN = myEnq.filter((e) => e.petId === p.id).length; const appsN = myApps.filter((a) => a.petId === p.id).length;
    const favN = favs.filter((f) => f.petId === p.id).length; const v = views[p.id] || 0;
    return { id: p.id, name: p.name, breed: p.breed, type: p.type, age: p.age, createdAt: p.createdAt, enquiries: enquiriesN, applications: appsN, favourites: favN, views: v,
      interest: enquiriesN * 3 + appsN * 4 + favN * 2 + v * 0.2 };
  });
  return {
    counts: { available: myPets.filter((p) => p.status === 'Available').length, onHold: myPets.filter((p) => p.status === 'On Hold').length,
      open: open.length, openEnquiries: myEnq.filter((e) => e.status === 'Open').length },
    needsReview: open.filter((a) => ['Submitted', 'Under Review'].includes(a.status)).sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)),
    incomplete: open.map((a) => ({ ...a, missing: missingSections(a) })).filter((a) => a.status === 'Info Requested' || a.missing.length >= 2),
    upcoming: open.filter((a) => APP_NEEDS_DATE.includes(a.status) && a.appointmentAt && new Date(a.appointmentAt) > new Date()).sort((a, b) => new Date(a.appointmentAt) - new Date(b.appointmentAt)),
    petInterest,
  };
}

router.post('/shelter', requireStaff, asyncHandler(async (req, res) => {
  const question = clean(req.body?.question, 500);
  if (!question) throw new HttpError(400, 'Ask a question first.');
  res.json(await ai.shelterAssistant(question, await shelterSnapshot(req)));
}));

router.get('/applications/:id/summary', requireStaff, asyncHandler(async (req, res) => {
  const app = await db.findOne('applications', { id: req.params.id });
  if (!app || !inScope(req, app)) throw new HttpError(404, 'Application not found.');
  const pet = await db.findOne('pets', { id: app.petId });
  res.json(await ai.summarizeApplication(app, pet));
}));

module.exports = router;
module.exports.shelterSnapshot = shelterSnapshot;

// ---- Social post maker (staff): caption + hashtags from public fields only; nothing is posted automatically ----
router.post('/promote', requireStaff, asyncHandler(async (req, res) => {
  const platform = String(req.body.platform || '').toLowerCase();
  const tone = String(req.body.tone || '').toLowerCase();
  if (!ai.PLATFORMS.includes(platform)) throw new HttpError(400, 'Choose Instagram or Facebook.');
  if (!ai.TONES.includes(tone)) throw new HttpError(400, 'Choose a friendly, playful or heartfelt tone.');
  const pet = await db.findOne('pets', { id: clean(req.body.petId, 40) });
  if (!pet || !inScope(req, pet)) throw new HttpError(404, 'Pet not found.');
  if (!['Available', 'On Hold'].includes(pet.status)) throw new HttpError(400, `${pet.name} isn't listed for adoption right now, so there's nothing to promote.`);
  const link = `${config.appUrl}/p/${encodeURIComponent(pet.id)}`;
  const post = await ai.promotePost(toPublic(pet), { platform, tone, link });
  res.json({ ...post, link, platform, tone });
}));

// ---- Compare up to 3 public pets side by side (adopters and visitors) ----
const COMPARE_MAX = 3;
router.post('/compare', asyncHandler(async (req, res) => {
  const raw = req.body?.ids;
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) throw new HttpError(400, 'Choose the pets to compare.');
  const ids = [...new Set(raw.map((x) => clean(x, 40)).filter(Boolean))];
  if (ids.length > COMPARE_MAX) throw new HttpError(400, `You can compare up to ${COMPARE_MAX} pets at a time.`);
  if (ids.length < 2) throw new HttpError(400, 'Choose at least 2 pets to compare.');
  const pets = await Promise.all(ids.map((id) => db.findOne('pets', { id })));
  const missing = pets.findIndex((p) => !p || !['Available', 'On Hold'].includes(p.status));
  if (missing >= 0) throw new HttpError(404, 'One of these pets is no longer listed for adoption. Remove it and try again.');
  const publicList = pets.map(toPublic);
  const profile = req.user?.role === 'user' ? req.user.preferences : null;
  const hasProfile = Boolean(profile && !profileIsEmpty(profile));
  const scores = hasProfile ? Object.fromEntries(pets.map((p) => [p.id, evaluateMatch(p, profile)])) : null;
  const result = await ai.comparePets(publicList, scores);
  const shelters = Object.fromEntries((await db.find('shelters')).map((s) => [s.id, s.name]));
  await db.insert('events', { id: newId('evt'), type: 'ai_compare', at: now() });
  res.json({ pets: publicList.map((p) => ({ ...p, shelterName: shelters[p.shelterId] || null })), scores, hasProfile,
    understood: hasProfile ? describeProfile(profile) : [], ...result });
}));

// ---- Translate public pet text or chat replies (cached: each text is translated once per language) ----
const translateLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : rateLimit.ipKeyGenerator(req.ip)),
  message: { error: 'Too many translations at once — please wait a few minutes and try again.' } });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const UNAVAILABLE = 'Translation isn\'t available right now, so this is shown in English.';
async function cached(key, petId, lang, hash, make) {
  const id = `tr_${sha(`${key}|${lang}|${hash}`).slice(0, 40)}`;
  const hit = await db.findOne('translations', { id });
  if (hit) return { value: hit.value, cached: true };
  const value = await make();
  if (value === null) return null;
  try { await db.insert('translations', { id, petId: petId || null, lang, hash, value, createdAt: now() }); } catch { /* translated twice at once — fine */ }
  return { value, cached: false };
}
router.post('/translate', translateLimiter, asyncHandler(async (req, res) => {
  const lang = String(req.body?.lang || '');
  if (!ai.LANGUAGES[lang]) throw new HttpError(400, `Choose a language: ${Object.values(ai.LANGUAGES).join(', ')}.`);
  const petId = req.body?.petId ? clean(req.body.petId, 40) : '';
  const texts = req.body?.texts;
  if (!petId && !Array.isArray(texts)) throw new HttpError(400, 'Send a pet or the text to translate.');
  if (petId) {
    const pet = await db.findOne('pets', { id: petId });
    if (!pet || !['Available', 'On Hold', 'Adopted'].includes(pet.status)) throw new HttpError(404, 'Pet not found.');
    const p = toPublic(pet);
    const fields = { description: String(p.description || ''), idealHome: String(p.idealHome || ''), traits: (p.traits || []).map(String) };
    if (lang === 'en') return res.json({ lang, translated: false, fields });
    const out = await cached(`pet:${pet.id}`, pet.id, lang, sha(JSON.stringify(fields)), () => ai.translate({ fields }, lang));
    if (!out) return res.json({ lang, translated: false, fields, notice: UNAVAILABLE });
    return res.json({ lang, translated: true, cached: out.cached, fields: out.value, label: 'Machine translated' });
  }
  if (!texts.length || texts.length > 10 || texts.some((t) => typeof t !== 'string' || !t.trim() || t.length > 2000)) {
    throw new HttpError(400, 'Send between 1 and 10 texts of up to 2,000 characters.');
  }
  if (lang === 'en') return res.json({ lang, translated: false, texts });
  // Look up each text in the cache; translate only the missing ones in one call
  const keys = texts.map((t) => `tr_${sha(`text|${lang}|${sha(t)}`).slice(0, 40)}`);
  const hits = await Promise.all(keys.map((id) => db.findOne('translations', { id })));
  const missing = texts.map((t, i) => (hits[i] ? null : i)).filter((i) => i !== null);
  const result = hits.map((h) => h?.value ?? null);
  if (missing.length) {
    const out = await ai.translate({ texts: missing.map((i) => texts[i]) }, lang);
    if (!out) return res.json({ lang, translated: false, texts, notice: UNAVAILABLE });
    for (const [j, i] of missing.entries()) {
      result[i] = out[j];
      try { await db.insert('translations', { id: keys[i], petId: null, lang, hash: sha(texts[i]), value: out[j], createdAt: now() }); } catch { /* duplicate */ }
    }
  }
  res.json({ lang, translated: true, cached: !missing.length, texts: result, label: 'Machine translated' });
}));
