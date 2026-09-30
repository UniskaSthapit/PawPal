// PawPal AI features. Every answer is grounded in real database records:
// - Pets come only from the live catalogue; any pet id a model returns is validated against it.
// - Match percentages come from the deterministic compatibility engine (matching.js).
// - When a language model is configured it reads free text and writes the wording; without one,
//   the rules engine answers from the same data. The response always says which was used.
const llm = require('./llm');
const { parseProfile, sanitizeProfile, describeProfile, evaluateMatch, rankPets, profileIsEmpty } = require('./matching');
const { FAQ, APPLICATION_QUESTIONS, findFaq } = require('./knowledge');
const { APP_STATUS_INFO } = require('../constants');

const SOURCE = () => (llm.llmEnabled ? llm.provider : 'rules');
const energyWord = (n) => ['low', 'moderate', 'high'][(Number(n) || 2) - 1];

// Compact, public-only view of a pet for prompts (no internal notes ever)
const promptPet = (p) => ({ id: p.id, name: p.name, type: p.type, breed: p.breed, age: p.age, gender: p.gender, size: p.size,
  location: p.location, energy: energyWord(p.energyLevel), traits: p.traits, goodWithChildren: p.goodWithChildren,
  goodWithOtherPets: p.goodWithOtherPets, needsYard: p.requiresYard, status: p.status, fee: p.adoptionFee,
  about: String(p.description || '').slice(0, 220) });

const GUARDRAILS = 'Only mention pets that appear in the provided data, using their exact names. Never invent pets, facts, prices, medical details or ' +
  'behaviour. Never promise how an animal will behave — compatibility is guidance only and the shelter makes the final decision. ' +
  'Distinguish shelter-provided facts from your own interpretation. Australian English, warm and concise.';

// ---------------- Pet description (shelter staff) ----------------
function templateDescription(pet) {
  const name = pet.name || 'This sweetheart';
  const traits = (pet.traits || []).map((t) => t.toLowerCase());
  const breed = pet.breed || (pet.type || 'pet').toLowerCase();
  const energy = ['a relaxed companion who enjoys slow mornings and a warm spot to nap',
    'a balanced friend who loves a good walk as much as a quiet evening in',
    'an energetic adventurer who lives for play, exploring and time outdoors'][(Number(pet.energyLevel) || 2) - 1];
  const traitLine = traits.length ? ` The team describes ${name} as ${traits.slice(0, -1).join(', ')}${traits.length > 1 ? ' and ' : ''}${traits.slice(-1)}.` : '';
  const kids = pet.goodWithChildren ? ` ${name} is comfortable around children.` : ' A home without young children would suit them best.';
  const others = pet.goodWithOtherPets ? ' They generally get along with other animals.' : ' They would prefer to be the only pet.';
  const home = pet.requiresYard ? ' A home with a secure yard is a must.' : ' They could settle into an apartment or a house.';
  const age = pet.age === undefined || pet.age === '' ? '' : Number(pet.age) === 0 ? 'young ' : `${Number(pet.age)}-year-old `;
  return `Meet ${name}, a ${age}${breed} and ${energy}.${traitLine}${kids}${others}${home} ` +
    `If you think ${name} could be part of your family, come and say hello.`;
}

async function describePet(pet) {
  if (!llm.llmEnabled) return { text: templateDescription(pet), source: 'rules' };
  try {
    const text = await llm.complete({
      system: `You write adoption profiles for an Australian animal shelter. 90–140 words, third person, warm and honest, no emojis, no headings. ${GUARDRAILS} Use only the facts given.`,
      messages: [{ role: 'user', content: `Write a public adoption profile from these shelter-provided facts:\n${JSON.stringify({
        name: pet.name, type: pet.type, breed: pet.breed, ageYears: pet.age, gender: pet.gender, size: pet.size,
        personality: pet.traits, energy: energyWord(pet.energyLevel), goodWithChildren: pet.goodWithChildren,
        goodWithOtherPets: pet.goodWithOtherPets, needsYard: pet.requiresYard, idealHome: pet.idealHome || undefined })}` }],
      maxTokens: 400,
    });
    return { text: text || templateDescription(pet), source: llm.provider };
  } catch (err) {
    console.warn('AI description fallback:', err.message);
    return { text: templateDescription(pet), source: 'rules' };
  }
}

// ---------------- Lifestyle understanding ----------------
async function understandLifestyle(text, prev = {}, locations = []) {
  const ruled = parseProfile(text, prev, locations);
  if (!llm.llmEnabled || !String(text || '').trim()) return { profile: ruled, source: 'rules' };
  try {
    const raw = await llm.complete({ json: true, maxTokens: 400,
      system: 'Extract a pet adopter\'s lifestyle profile from their message. Use null when not stated — never guess. Schema: ' +
        '{"homeType":"apartment|house|farm|null","hasYard":bool|null,"activity":1|2|3|null (1 relaxed, 2 moderate, 3 very active),' +
        '"experience":"first|some|experienced|null","hoursAlone":number|null,"hasChildren":bool|null,"hasOtherPets":bool|null,' +
        '"preferredType":"dog|cat|other|any|null","size":["small"|"medium"|"large"],"age":["baby"|"young"|"adult"|"senior"],' +
        '"temperament":["calm","quiet","gentle","playful","affectionate","cuddly","friendly","smart","loyal","independent","active","curious","social"],"location":string|null}',
      messages: [{ role: 'user', content: `Previously known: ${JSON.stringify(prev)}\nMessage: ${String(text).slice(0, 1500)}` }] });
    return { profile: sanitizeProfile(raw, ruled), source: llm.provider };
  } catch (err) {
    console.warn('AI profile fallback:', err.message);
    return { profile: ruled, source: 'rules' };
  }
}

// ---------------- Matching explanations ----------------
function ruleSummary(m) {
  if (!m.reasons.length) return `${m.pet.name} could be worth meeting — ask the shelter how they'd suit your routine.`;
  const [a, b] = m.reasons;
  return `${a}${b ? `, and ${b.charAt(0).toLowerCase()}${b.slice(1)}` : ''}.`;
}

async function explainMatches(profile, ranked) {
  const base = ranked.map((m) => ({ ...m, summary: ruleSummary(m) }));
  if (!llm.llmEnabled || !ranked.length) return { matches: base, source: 'rules' };
  try {
    const raw = await llm.complete({ json: true, maxTokens: 900,
      system: `You explain pet adoption matches. For each pet write one or two sentences (max 40 words) on why they may suit this adopter, based ONLY on the reasons and facts provided. ${GUARDRAILS} Return {"explanations":[{"petId":string,"summary":string}]}`,
      messages: [{ role: 'user', content: JSON.stringify({ adopter: describeProfile(profile),
        pets: ranked.map((m) => ({ petId: m.pet.id, ...promptPet(m.pet), matchScore: m.score, reasons: m.reasons, considerations: m.considerations })) }) }] });
    const byId = new Map((raw.explanations || []).map((e) => [e.petId, String(e.summary || '').slice(0, 300)]));
    return { matches: base.map((m) => (byId.get(m.pet.id) ? { ...m, summary: byId.get(m.pet.id) } : m)), source: llm.provider };
  } catch (err) {
    console.warn('AI explanation fallback:', err.message);
    return { matches: base, source: 'rules' };
  }
}

// ---------------- Natural language search ----------------
// Turns "small friendly dog for a first-time owner" into filters the database understands.
function profileToFilters(p) {
  return {
    type: p.preferredType && p.preferredType !== 'any' ? p.preferredType : '',
    size: p.size || [], age: p.age || [],
    energy: p.activity === 1 ? [1] : p.activity === 2 ? [1, 2] : [],
    apartment: p.homeType === 'apartment' || p.hasYard === false,
    kids: p.hasChildren === true, otherPets: p.hasOtherPets === true,
    firstTime: p.experience === 'first',
    location: p.location ? p.location.toLowerCase() : '',
  };
}

function describeFilters(f) {
  const bits = [];
  if (f.size.length) bits.push(f.size.join(' or '));
  if (f.energy.length) bits.push(f.energy.length === 1 ? 'calm' : 'calm-to-moderate energy');
  bits.push(f.type ? { dog: 'dogs', cat: 'cats', other: 'small pets' }[f.type] : 'pets');
  const extra = [];
  if (f.apartment) extra.push('suited to apartments');
  if (f.kids) extra.push('good with children');
  if (f.otherPets) extra.push('fine with other pets');
  if (f.firstTime) extra.push('suited to first-time owners');
  if (f.age.length) extra.push(`aged ${f.age.join('/')}`);
  if (f.location) extra.push(`near ${f.location.toUpperCase().length <= 3 ? f.location.toUpperCase() : f.location}`);
  return `${bits.join(' ')}${extra.length ? ' ' + extra.join(', ') : ''}`;
}

// ---------------- Chat assistant ----------------
const nameMention = (text, pets) => {
  const t = String(text).toLowerCase();
  return pets.find((p) => new RegExp(`\\b${p.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t));
};

function nextQuestion(p) {
  if (!p.homeType && p.hasYard === null) return 'What kind of home do you have — an apartment, or a house with a yard?';
  if (!p.activity) return 'How active is your day-to-day life — relaxed, moderately active, or very active?';
  if (p.hoursAlone === null || p.hoursAlone === undefined) return 'Roughly how many hours would your pet be on their own on a typical day?';
  if (p.hasChildren === null || p.hasChildren === undefined) return 'Are there children in your home?';
  if (p.hasOtherPets === null || p.hasOtherPets === undefined) return 'Do you have other pets at the moment?';
  if (!p.preferredType) return 'Are you hoping for a dog, a cat, or are you open to any pet?';
  return 'Want me to narrow these down further, or tell you more about one of them?';
}

function petFacts(pet, shelterName) {
  const age = pet.age === 0 ? 'young' : `${pet.age}-year-old`;
  const facts = [`${pet.name} is a ${age} ${pet.gender !== 'Unknown' ? pet.gender.toLowerCase() + ' ' : ''}${pet.breed} (${pet.size.toLowerCase()} size) in ${pet.location || 'our care'}${shelterName ? ` with ${shelterName}` : ''}.`];
  facts.push(`The shelter records ${energyWord(pet.energyLevel)} energy${pet.traits?.length ? ` and describes them as ${pet.traits.slice(0, 3).join(', ').toLowerCase()}` : ''}.`);
  facts.push(`${pet.goodWithChildren ? 'Good with children' : 'Best without young children'}; ${pet.goodWithOtherPets ? 'gets on with other animals' : 'prefers to be the only pet'}; ${pet.requiresYard ? 'needs a secure yard' : 'no yard required'}.`);
  const care = [pet.vaccinated && 'vaccinated', pet.desexed && 'desexed', pet.microchipped && 'microchipped'].filter(Boolean);
  if (care.length) facts.push(`They are ${care.join(', ')}.`);
  if (pet.adoptionFee) facts.push(`Adoption fee: $${pet.adoptionFee}.`);
  if (pet.status === 'On Hold') facts.push('Heads up: they are currently on hold while another adopter meets them.');
  return facts.join(' ');
}

function rulesChat({ message, profile, pets, applications, user, lastPetIds = [], shelters = {} }) {
  const t = message.toLowerCase().replace(/[’']/g, '');
  const mentioned = nameMention(message, pets);
  const pick = (m) => ({ pet: m.pet, score: m.score, reasons: m.reasons, considerations: m.considerations });

  // 1. Application status
  if (/\b(status|my application|my applications|applied|progress|where (is|are) my|update on)\b/.test(t) && !/what happens/.test(t)) {
    if (!user) return { reply: 'I can check that for you once you log in — your applications are private to your account. Log in, then ask me again or open My Applications.', picks: [], actions: [{ label: 'Log in', href: 'login.html' }] };
    if (user.role !== 'user') return { reply: 'Staff accounts don\'t have adoption applications. Use the shelter dashboard to review applicants.', picks: [] };
    if (!applications.length) return { reply: 'You don\'t have any adoption applications yet. When you find a pet you love, press "Apply to adopt" on their profile and I can track it for you.', picks: [] };
    const lines = applications.slice(0, 4).map((a) => `• ${a.petName}: ${a.status} — ${APP_STATUS_INFO[a.status] || ''}${a.appointmentAt ? ` (booked ${new Date(a.appointmentAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })})` : ''}`);
    return { reply: `Here's where your applications are up to:\n${lines.join('\n')}`, picks: [], actions: [{ label: 'Open my timeline', href: 'my-applications.html' }] };
  }

  // 2. Why was a pet recommended?
  if (/\bwhy\b/.test(t) && (mentioned || lastPetIds.length)) {
    const pet = mentioned || pets.find((p) => p.id === lastPetIds[0]);
    if (pet) {
      const m = evaluateMatch(pet, profile);
      const reasons = m.reasons.length ? m.reasons.map((r) => `• ${r}`).join('\n') : '• I don\'t know enough about your lifestyle yet to give specific reasons.';
      const cons = m.considerations.length ? `\nWorth considering:\n${m.considerations.map((r) => `• ${r}`).join('\n')}` : '';
      return { reply: `${pet.name} scored ${m.score}% against what you've told me. Based on the shelter's information:\n${reasons}${cons}\n\nThis is guidance, not a guarantee — the shelter team can tell you much more.`, picks: [pick({ pet, ...m })] };
    }
  }

  // 3. A specific pet
  if (mentioned) {
    const m = evaluateMatch(mentioned, profile);
    return { reply: `${petFacts(mentioned, shelters[mentioned.shelterId]?.name)}\n\n${mentioned.description ? `From the shelter: "${String(mentioned.description).slice(0, 260)}${mentioned.description.length > 260 ? '…' : ''}"` : ''}`.trim(), picks: [pick({ pet: mentioned, ...m })] };
  }

  // 4. Adoption process and FAQs
  const faq = findFaq(t);
  const lifestyle = !profileIsEmpty(parseProfile(message));
  if (faq && !lifestyle) return { reply: faq.a, picks: [], faq: faq.id };

  // 5. Location
  if (/\b(near me|nearby|close to me|in my area|near (to )?[a-z]+)\b/.test(t) && !profile.location) {
    return { reply: 'Which suburb, city or state are you in? For example "Melbourne" or "NSW" — I\'ll show pets close by.', picks: [] };
  }

  // 6. Recommendations from lifestyle
  const hasProfile = !profileIsEmpty(profile);
  if (hasProfile || /\b(recommend|suggest|suit|match|best|which (dogs?|cats?|pets?)|show me|looking for|want a|find me)\b/.test(t)) {
    let pool = pets;
    if (profile.location) {
      const local = pets.filter((p) => p.location.toLowerCase().includes(profile.location.toLowerCase()));
      if (local.length) pool = local;
    }
    const top = rankPets(pool, profile, 3);
    if (!top.length) return { reply: 'There aren\'t any pets that fit right now, but new animals arrive every week. Try widening what you\'re looking for.', picks: [] };
    const understood = describeProfile(profile);
    const intro = understood.length ? `Here's what I understood: ${understood.slice(0, 5).join(', ').toLowerCase()}.` : 'Here are some lovely pets available right now.';
    const list = top.map((m) => `• ${m.pet.name} (${m.pet.breed}) — ${m.score}% match${m.reasons[0] ? `: ${m.reasons[0].charAt(0).toLowerCase()}${m.reasons[0].slice(1)}` : ''}`).join('\n');
    return { reply: `${intro}\n\n${list}\n\n${nextQuestion(profile)}`, picks: top.map(pick) };
  }

  if (/^(hi|hello|hey|gday|good (morning|afternoon|evening)|yo)\b/.test(t.trim())) {
    return { reply: `Hi${user ? ` ${user.name.split(' ')[0]}` : ''}! I'm PawPal's adoption assistant. Tell me a little about your home and routine and I'll suggest pets that could suit you — or ask me about a pet, the adoption process, or your application.`, picks: [] };
  }
  return { reply: 'I can help you find a compatible pet, tell you about a specific pet, explain the adoption process, or check your application status. Try something like "I live in an apartment and want a calm dog".', picks: [] };
}

async function chat(ctx) {
  const { message, history = [], prevProfile = {}, pets, applications = [], user, lastPetIds = [], shelters = {} } = ctx;
  const locations = [...new Set(pets.map((p) => p.location).filter(Boolean))];
  const { profile } = await understandLifestyle(message, prevProfile, locations);
  const rules = rulesChat({ message, profile, pets, applications, user, lastPetIds, shelters });
  if (!llm.llmEnabled) return { ...rules, profile, source: 'rules' };

  try {
    const candidates = rankPets(pets, profile, 8).map((m) => ({ ...promptPet(m.pet), matchScore: m.score, reasons: m.reasons, considerations: m.considerations }));
    const myApps = applications.map((a) => ({ pet: a.petName, status: a.status, meaning: APP_STATUS_INFO[a.status], appointment: a.appointmentAt, updated: a.updatedAt }));
    const raw = await llm.complete({ json: true, maxTokens: 700,
      system: `You are PawPal's adoption assistant for Australian animal shelters. Help people find compatible pets, answer questions about specific pets and the adoption process, and explain application status. ${GUARDRAILS}
Keep replies under 120 words; plain text with simple "•" bullets when listing. Recommend at most 3 pets and include their ids in petIds. When recommending, prefer the ranked candidates and quote their matchScore as the match percentage. If the user asks about their application and "myApplications" is empty or the user is not logged in, say so.
Return {"reply": string, "petIds": string[]}.
Adoption FAQ: ${JSON.stringify(FAQ.map((f) => ({ q: f.q, a: f.a })))}`,
      messages: [
        { role: 'user', content: `DATA (from the PawPal database):\n${JSON.stringify({ loggedIn: Boolean(user), firstName: user?.name?.split(' ')[0],
          understoodLifestyle: describeProfile(profile), rankedCandidates: candidates, catalogue: pets.slice(0, 60).map(promptPet), myApplications: user ? myApps : undefined })}` },
        { role: 'assistant', content: '{"reply":"Understood — I will only use this data.","petIds":[]}' },
        ...history.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, 800) })),
        { role: 'user', content: message },
      ] });
    const ids = Array.isArray(raw.petIds) ? raw.petIds : [];
    const picks = ids.map((id) => pets.find((p) => p.id === id)).filter(Boolean).slice(0, 3)
      .map((pet) => ({ pet, ...evaluateMatch(pet, profile) }));
    return { reply: String(raw.reply || rules.reply).slice(0, 1500), picks, actions: rules.actions, profile, source: llm.provider };
  } catch (err) {
    console.warn('AI chat fallback:', err.message);
    return { ...rules, profile, source: 'rules' };
  }
}

// ---------------- Application question helper ----------------
async function explainQuestion(key, userQuestion = '') {
  const q = APPLICATION_QUESTIONS[key];
  if (!q) return null;
  if (!llm.llmEnabled || !userQuestion.trim()) return { question: q.label, explanation: q.help, source: 'rules' };
  try {
    const text = await llm.complete({ maxTokens: 250,
      system: 'You help people understand questions on a pet adoption application. Explain what the question means and why the shelter asks it. ' +
        'NEVER suggest, draft or fill in an answer for them — the adopter is responsible for their own answers. Max 80 words, friendly, Australian English.',
      messages: [{ role: 'user', content: `Application question: "${q.label}"\nBackground: ${q.help}\nTheir question: ${userQuestion.slice(0, 400)}` }] });
    return { question: q.label, explanation: text || q.help, source: llm.provider };
  } catch {
    return { question: q.label, explanation: q.help, source: 'rules' };
  }
}

// ---------------- Shelter staff assistant ----------------
function shelterRules(question, snap) {
  const t = question.toLowerCase();
  const days = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso)) / 86400000));
  const appItem = (a) => ({ label: `${a.name} → ${a.petName}`, sub: `${a.status} · ${days(a.submittedAt)}d since submitted${a.score !== undefined ? ` · suitability ${a.score}` : ''}`, link: `applications.html?id=${a.id}` });
  const petItem = (p, sub) => ({ label: `${p.name} (${p.breed})`, sub, link: `add-pet.html?id=${p.id}` });

  if (/incomplete|missing|unfinished|waiting on (the )?applicant|info/.test(t)) {
    const items = snap.incomplete.map((a) => ({ ...appItem(a), sub: `${a.status} · missing: ${a.missing.join(', ') || 'awaiting applicant reply'}` }));
    return { reply: items.length ? `${items.length} application${items.length > 1 ? 's are' : ' is'} incomplete or waiting on the applicant.` : 'No incomplete applications right now.', items };
  }
  if (/no (enquir|interest|applica)|zero|nobody|least|overlooked|not getting/.test(t)) {
    const items = snap.petInterest.filter((p) => p.enquiries === 0 && p.applications === 0).map((p) => petItem(p, `${p.views} views · listed ${days(p.createdAt)} days`));
    return { reply: items.length ? `${items.length} available pet${items.length > 1 ? 's have' : ' has'} had no enquiries or applications. A fresh photo or an updated profile can help.` : 'Every available pet has had at least one enquiry or application.', items };
  }
  if (/most|popular|top|interest|enquir/.test(t)) {
    const items = [...snap.petInterest].sort((a, b) => b.interest - a.interest).slice(0, 5)
      .map((p) => petItem(p, `${p.enquiries} enquiries · ${p.applications} applications · ${p.favourites} saves · ${p.views} views`));
    return { reply: items.length ? `Pets with the most interest (enquiries, applications, saves and views combined):` : 'No pets listed yet.', items };
  }
  if (/appointment|upcoming|schedule|this week|meet|interview/.test(t)) {
    const items = snap.upcoming.map((a) => ({ ...appItem(a), sub: `${a.status} · ${new Date(a.appointmentAt).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` }));
    return { reply: items.length ? `${items.length} upcoming appointment${items.length > 1 ? 's' : ''}:` : 'No upcoming appointments are booked.', items };
  }
  if (/long(est)?|stay|waiting the longest|been here/.test(t)) {
    const items = [...snap.petInterest].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 5).map((p) => petItem(p, `Listed ${days(p.createdAt)} days ago`));
    return { reply: 'Available pets who have been waiting the longest:', items };
  }
  if (/review|pending|new|submitted|need|queue|to do|todo/.test(t)) {
    const items = snap.needsReview.map(appItem);
    return { reply: items.length ? `${items.length} application${items.length > 1 ? 's need' : ' needs'} review, oldest first.` : 'The review queue is clear.', items };
  }
  return { reply: `Right now: ${snap.counts.available} pets available, ${snap.counts.open} open applications (${snap.needsReview.length} awaiting review), ${snap.counts.openEnquiries} unanswered enquiries and ${snap.upcoming.length} upcoming appointments. Ask me which applications need review, which are incomplete, which pets have the most or no enquiries, or what's booked this week.`, items: [] };
}

async function shelterAssistant(question, snap) {
  const rules = shelterRules(question, snap);
  if (!llm.llmEnabled) return { ...rules, source: 'rules' };
  try {
    const text = await llm.complete({ maxTokens: 500,
      system: 'You are an assistant for animal shelter staff inside PawPal. Answer using ONLY the data snapshot (which is already limited to what this staff member may see). ' +
        'Be concise (max 120 words), practical, and use "•" bullets for lists. Do not invent numbers. Do not repeat contact details.',
      messages: [{ role: 'user', content: `Snapshot: ${JSON.stringify({ counts: snap.counts, needsReview: snap.needsReview.slice(0, 15).map((a) => ({ applicant: a.name, pet: a.petName, status: a.status, submitted: a.submittedAt, suitability: a.score })),
        incomplete: snap.incomplete.slice(0, 15).map((a) => ({ applicant: a.name, pet: a.petName, status: a.status, missing: a.missing })),
        petInterest: snap.petInterest.slice(0, 40).map((p) => ({ pet: p.name, breed: p.breed, age: p.age, type: p.type, enquiries: p.enquiries, applications: p.applications, favourites: p.favourites, views: p.views, listedDays: Math.round((Date.now() - new Date(p.createdAt)) / 86400000) })),
        upcoming: snap.upcoming.map((a) => ({ applicant: a.name, pet: a.petName, status: a.status, at: a.appointmentAt })) })}\n\nQuestion: ${question}` }] });
    return { reply: text || rules.reply, items: rules.items, source: llm.provider };
  } catch (err) {
    console.warn('Shelter assistant fallback:', err.message);
    return { ...rules, source: 'rules' };
  }
}

// Summary of one application for staff (the applicant's own answers only — no staff notes sent)
async function summarizeApplication(app, pet) {
  const m = pet ? evaluateMatch(pet, {
    homeType: /apartment/i.test(app.livingType) ? 'apartment' : /farm/i.test(app.livingType) ? 'farm' : 'house',
    hasYard: /yard|farm/i.test(app.livingType) && !/without/i.test(app.livingType), activity: Number(app.activityLevel) || null,
    experience: { 'First-time owner': 'first', 'Some experience': 'some', Experienced: 'experienced' }[app.experience] || null,
    hoursAlone: app.hoursAlone === '' ? null : Number(app.hoursAlone), hasChildren: app.hasChildren === '' ? null : !!app.hasChildren,
    hasOtherPets: app.hasOtherPets === '' ? null : !!app.hasOtherPets, size: [], age: [], temperament: [] }) : { reasons: [], considerations: [] };
  const rules = [`${app.name} applied for ${app.petName} on ${new Date(app.submittedAt).toLocaleDateString('en-AU')}.`,
    `Home: ${app.livingType || 'not given'}${app.ownership ? ` (${app.ownership.toLowerCase()})` : ''}; activity ${['relaxed', 'moderate', 'very active'][(app.activityLevel || 2) - 1]}; pet alone ~${app.hoursAlone} hrs/day.`,
    `Household: ${app.hasChildren ? 'children' : 'no children'}, ${app.hasOtherPets ? 'other pets' : 'no other pets'}; experience: ${app.experience || 'not given'}.`,
    `Suitability score ${app.score}/100 (${app.label}).`,
    m.reasons.length ? `Strengths: ${m.reasons.join('; ')}.` : '',
    m.considerations.length || app.notes?.length ? `Check: ${[...m.considerations, ...(app.notes || [])].join('; ')}.` : ''].filter(Boolean).join(' ');
  if (!llm.llmEnabled) return { summary: rules, strengths: m.reasons, considerations: [...m.considerations, ...(app.notes || [])], source: 'rules' };
  try {
    const text = await llm.complete({ maxTokens: 350,
      system: 'Summarise an adoption application for shelter staff in 4–6 short bullet points ("•"): household, routine, experience, fit with the pet, and anything to verify at interview. Use only the data. Do not decide the outcome.',
      messages: [{ role: 'user', content: JSON.stringify({ pet: pet ? promptPet(pet) : { name: app.petName },
        application: { livingType: app.livingType, ownership: app.ownership, landlordPermission: app.landlordPermission, activityLevel: app.activityLevel,
          hoursAlone: app.hoursAlone, hasChildren: app.hasChildren, hasOtherPets: app.hasOtherPets, experience: app.experience,
          experienceDetails: app.experienceDetails, motivation: app.motivation, workSchedule: app.workSchedule, householdAdults: app.householdAdults,
          suitabilityScore: app.score, scoreBreakdown: app.breakdown }, computedFit: m }) }] });
    return { summary: text || rules, strengths: m.reasons, considerations: [...m.considerations, ...(app.notes || [])], source: llm.provider };
  } catch {
    return { summary: rules, strengths: m.reasons, considerations: [...m.considerations, ...(app.notes || [])], source: 'rules' };
  }
}

// ---------------- Analytics insights ----------------
async function insights(facts, ruleSentences) {
  if (!llm.llmEnabled || !ruleSentences.length) return { insights: ruleSentences, source: 'rules' };
  try {
    const raw = await llm.complete({ json: true, maxTokens: 500,
      system: 'You are an analyst for an animal shelter. Write 3–5 short, specific insights (max 30 words each) using ONLY the numbers given. No speculation beyond the data. Return {"insights": string[]}',
      messages: [{ role: 'user', content: JSON.stringify(facts) }] });
    const list = (raw.insights || []).map((s) => String(s).slice(0, 240)).filter(Boolean).slice(0, 5);
    return { insights: list.length ? list : ruleSentences, source: list.length ? llm.provider : 'rules' };
  } catch {
    return { insights: ruleSentences, source: 'rules' };
  }
}

module.exports = { describePet, templateDescription, understandLifestyle, explainMatches, profileToFilters, describeFilters,
  chat, explainQuestion, shelterAssistant, summarizeApplication, insights, promptPet, SOURCE };
