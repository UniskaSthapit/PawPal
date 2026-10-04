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
    if (!err.quiet) console.warn('AI description fallback:', err.message.split('\n')[0].slice(0, 160));
    return { text: templateDescription(pet), source: 'rules' };
  }
}

// ---------------- Social post maker (staff) ----------------
const PLATFORMS = ['instagram', 'facebook'];
const TONES = ['friendly', 'playful', 'heartfelt'];
const SPECIES_TAGS = { Dog: ['RescueDog', 'AdoptADog', 'DogsOfInstagram'], Cat: ['RescueCat', 'AdoptACat', 'CatsOfInstagram'], Rabbit: ['RescueBunny', 'AdoptARabbit'],
  'Guinea Pig': ['GuineaPigsOfInstagram', 'AdoptAGuineaPig'], Hamster: ['HamsterLove', 'AdoptAHamster'], Bird: ['RescueBird', 'AdoptABird'],
  Reptile: ['ReptileRescue', 'AdoptAReptile'], Fish: ['AquariumLife', 'AdoptAFish'], 'Farm Animal': ['FarmSanctuary', 'AdoptAFarmAnimal'], Other: ['AdoptAPet'] };
const cleanTag = (t) => String(t || '').replace(/^#/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
function baseHashtags(pet) {
  const city = cleanTag(String(pet.location || '').split(',')[0].replace(/\s+/g, ''));
  return [...new Set(['AdoptDontShop', ...(SPECIES_TAGS[pet.type] || SPECIES_TAGS.Other), 'PawPal', city && `${city}Pets`].filter(Boolean))];
}
// Template caption used without an AI key (or when the AI is unavailable) — public facts only
function templatePost(pet, { platform, tone, link }) {
  const age = pet.age === undefined || pet.age === '' ? '' : Number(pet.age) === 0 ? 'young ' : `${Number(pet.age)}-year-old `;
  const traits = (pet.traits || []).slice(0, 3).map((t) => t.toLowerCase());
  const traitText = traits.length ? `${traits.slice(0, -1).join(', ')}${traits.length > 1 ? ' and ' : ''}${traits.slice(-1)}` : 'full of personality';
  const extras = [pet.goodWithChildren && 'good with kids', pet.goodWithOtherPets && 'happy with other pets', !pet.requiresYard && 'fine without a yard']
    .filter(Boolean).slice(0, 2);
  const openers = {
    friendly: `Meet ${pet.name}! 🐾 This ${age}${pet.breed} is ${traitText} and looking for a home of their own.`,
    playful: `Warning: ${pet.name} may steal your heart (and the best spot on the couch). 😄 This ${age}${pet.breed} is ${traitText}!`,
    heartfelt: `Every day, ${pet.name} waits for the person who'll call them family. This ${age}${pet.breed} is ${traitText}, and ready to love someone.`,
  };
  const middle = extras.length ? ` ${pet.name} is ${extras.join(' and ')}.` : '';
  const where = pet.location ? ` Currently at our ${String(pet.location).split(',')[0]} shelter.` : '';
  const close = platform === 'instagram' ? `\n\nTap the link in our bio to meet ${pet.name}.` : `\n\nMeet ${pet.name} and apply here: ${link}`;
  return { caption: `${openers[tone] || openers.friendly}${middle}${where}${close}`, hashtags: baseHashtags(pet) };
}
async function promotePost(pet, { platform = 'instagram', tone = 'friendly', link = '' } = {}) {
  const fallback = templatePost(pet, { platform, tone, link });
  if (!llm.llmEnabled) return { ...fallback, source: 'rules' };
  try {
    const raw = await llm.complete({ json: true, maxTokens: 600,
      system: `You write social media posts for an Australian animal shelter to help a pet get adopted. ${GUARDRAILS}
Use only the facts given; never mention health, medical or rescue history. Tone: ${tone}. Platform: ${platform}.
${platform === 'instagram' ? 'Instagram: 60–110 words, short lines, up to 3 emojis, end with "Link in bio to meet NAME".' : `Facebook: 80–140 words, a friendly paragraph or two, up to 2 emojis, end with the profile link ${link}.`}
Return {"caption": string (no hashtags in it), "hashtags": string[] (6–10, without #, no spaces)}.`,
      messages: [{ role: 'user', content: JSON.stringify({ pet: promptPet(pet), profileLink: link }) }] });
    const caption = typeof raw.caption === 'string' ? raw.caption.replace(/(^|\s)#\w+/g, '').trim().slice(0, 2000) : '';
    const hashtags = Array.isArray(raw.hashtags) ? [...new Set(raw.hashtags.map(cleanTag).filter((t) => t.length >= 3))].slice(0, 10) : [];
    if (caption.length < 30 || !caption.includes(pet.name)) return { ...fallback, source: 'rules' };
    return { caption, hashtags: hashtags.length >= 3 ? hashtags : fallback.hashtags, source: llm.provider };
  } catch (err) {
    if (!err.quiet) console.warn('AI social post fallback:', err.message.split('\n')[0].slice(0, 160));
    return { ...fallback, source: 'rules' };
  }
}

// ---------------- Compare pets (adopters) ----------------
const listNames = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.slice(-1)}` : names[0] || '');
// Rules explanation built from shelter facts and (when the adopter has a saved lifestyle) the match scores
function templateCompare(pets, scores = null) {
  const lines = [];
  const highlights = {};
  const note = (pet, text) => { (highlights[pet.id] = highlights[pet.id] || []).push(text); };
  if (scores) {
    const ranked = [...pets].sort((a, b) => scores[b.id].score - scores[a.id].score);
    const [top, next] = ranked;
    const gap = scores[top.id].score - scores[next.id].score;
    lines.push(gap >= 5
      ? `For the lifestyle you've told us about, ${top.name} is the closest fit (${scores[top.id].score}% vs ${scores[next.id].score}% for ${next.name}).`
      : `${listNames(ranked.map((p) => p.name))} are a similarly good fit for your lifestyle (${ranked.map((p) => `${scores[p.id].score}%`).join(', ')}).`);
    ranked.forEach((p) => {
      if (scores[p.id].reasons[0]) note(p, scores[p.id].reasons[0]);
      if (scores[p.id].considerations[0]) note(p, `Worth considering: ${scores[p.id].considerations[0].charAt(0).toLowerCase()}${scores[p.id].considerations[0].slice(1)}`);
    });
  }
  const byEnergy = [...pets].sort((a, b) => (Number(a.energyLevel) || 2) - (Number(b.energyLevel) || 2));
  if ((Number(byEnergy[0].energyLevel) || 2) !== (Number(byEnergy.at(-1).energyLevel) || 2)) {
    lines.push(`${byEnergy[0].name} is the calmest; ${byEnergy.at(-1).name} has the most energy and will need the most exercise.`);
  }
  const kids = pets.filter((p) => p.goodWithChildren).map((p) => p.name);
  if (kids.length && kids.length < pets.length) lines.push(`The shelter says ${listNames(kids)} ${kids.length > 1 ? 'are' : 'is'} good with children.`);
  const yard = pets.filter((p) => p.requiresYard).map((p) => p.name);
  if (yard.length && yard.length < pets.length) lines.push(`${listNames(yard)} need${yard.length > 1 ? '' : 's'} a secure yard.`);
  const others = pets.filter((p) => !p.goodWithOtherPets).map((p) => p.name);
  if (others.length && others.length < pets.length) lines.push(`${listNames(others)} would prefer to be the only pet.`);
  pets.forEach((p) => {
    const traits = (p.traits || []).slice(0, 2).map((t) => t.toLowerCase());
    if (traits.length) note(p, `Described by the shelter as ${traits.join(' and ')}`);
    if (p.status === 'On Hold') note(p, 'Currently on hold for another adopter');
  });
  if (!lines.length) lines.push(`${listNames(pets.map((p) => p.name))} have a lot in common — meeting them is the best way to decide.`);
  lines.push('Compatibility is guidance only; the shelter team will help you decide.');
  return { summary: lines.join(' '), highlights: pets.map((p) => ({ petId: p.id, points: (highlights[p.id] || []).slice(0, 3) })) };
}

async function comparePets(pets, scores = null) {
  const fallback = templateCompare(pets, scores);
  if (!llm.llmEnabled) return { ...fallback, source: 'rules' };
  try {
    const raw = await llm.complete({ json: true, maxTokens: 700,
      system: `You help someone choose between rescue pets they are comparing. ${GUARDRAILS}
Compare the pets side by side in 60–120 words: who suits what kind of home, energy and care differences, and anything to ask the shelter.
${scores ? 'Each pet has a compatibility score with the adopter\'s lifestyle — refer to it, but do not change it.' : 'There is no adopter profile — do not guess one.'}
Return {"summary": string, "highlights": [{"petId": string, "points": string[] (1–3 short points, max 16 words each)}]}.`,
      messages: [{ role: 'user', content: JSON.stringify({ pets: pets.map((p) => ({ ...promptPet(p), ...(scores ? { compatibility: scores[p.id] } : {}) })) }) }] });
    const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 1500) : '';
    if (summary.length < 40 || !pets.some((p) => summary.includes(p.name))) return { ...fallback, source: 'rules' };
    const ids = new Set(pets.map((p) => p.id));
    const given = new Map((Array.isArray(raw.highlights) ? raw.highlights : [])
      .filter((h) => h && ids.has(h.petId) && Array.isArray(h.points))
      .map((h) => [h.petId, h.points.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 160)).slice(0, 3)]));
    const highlights = fallback.highlights.map((h) => ({ petId: h.petId, points: given.get(h.petId)?.length ? given.get(h.petId) : h.points }));
    return { summary, highlights, source: llm.provider };
  } catch (err) {
    if (!err.quiet) console.warn('AI compare fallback:', err.message.split('\n')[0].slice(0, 160));
    return { ...fallback, source: 'rules' };
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
    const profile = sanitizeProfile(raw, ruled);
    // A species change spotted in this message always wins over anything carried over from earlier in the chat
    if (ruled.preferredType !== (prev.preferredType ?? null)) { profile.preferredType = ruled.preferredType; profile.size = ruled.size; profile.age = ruled.age; }
    return { profile, source: llm.provider };
  } catch (err) {
    if (!err.quiet) console.warn('AI profile fallback:', err.message.split('\n')[0].slice(0, 160));
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
    if (!err.quiet) console.warn('AI explanation fallback:', err.message.split('\n')[0].slice(0, 160));
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


// ---------------- What animals do we actually have? ----------------
// Animals people might ask for. `kind` is the catalogue group used for matching; wild animals are never rehomed here.
const ANIMALS = [
  ['dog', /\b(dogs?|pupp(y|ies)|pups?|pooch(es)?|doggos?)\b/, 'dogs', (p) => p.type === 'Dog'],
  ['cat', /\b(cats?|kittens?|kitty|kitties)\b/, 'cats', (p) => p.type === 'Cat'],
  ['rabbit', /\b(rabbits?|bunn(y|ies))\b/, 'rabbits', (p) => p.type === 'Rabbit' || /rabbit|lop|dwarf/i.test(p.breed)],
  ['guinea pig', /\bguinea ?pigs?\b/, 'guinea pigs', (p) => p.type === 'Guinea Pig' || /guinea/i.test(p.breed)],
  ['hamster', /\bhamsters?\b/, 'hamsters', (p) => /hamster/i.test(p.breed)],
  ['bird', /\b(birds?|budgies?|budgerigars?|parrots?|cockatiels?|cockatoos?|canar(y|ies)|finch(es)?|lorikeets?|galahs?)\b/, 'birds', (p) => p.type === 'Bird' || /budgie|parrot|cockat|canary|finch|lorikeet|galah/i.test(p.breed)],
  ['mouse or rat', /\b(mice|mouse|rats?)\b/, 'mice and rats', (p) => /\b(mouse|mice|rat)\b/i.test(p.breed)],
  ['ferret', /\bferrets?\b/, 'ferrets', (p) => /ferret/i.test(p.breed)],
  ['chinchilla', /\bchinchillas?\b/, 'chinchillas', (p) => /chinchilla/i.test(p.breed)],
  ['fish', /\b(fish|fishes|goldfish|betta)\b/, 'fish', (p) => /fish|betta/i.test(p.breed)],
  ['snake', /\b(snakes?|pythons?)\b/, 'snakes', (p) => /snake|python/i.test(p.breed)],
  ['lizard', /\b(lizards?|geckos?|bearded dragons?|skinks?|blue-?tongues?)\b/, 'lizards', (p) => /lizard|gecko|dragon|skink/i.test(p.breed)],
  ['reptile', /\b(reptiles?|turtles?|tortoises?)\b/, 'reptiles', (p) => p.type === 'Reptile' || /lizard|snake|python|gecko|dragon|turtle|tortoise|skink/i.test(p.breed)],
  ['horse', /\b(horses?|ponies|pony|donkeys?)\b/, 'horses', (p) => /horse|pony|donkey/i.test(p.breed)],
  ['goat', /\bgoats?\b/, 'goats', (p) => /\bgoat\b/i.test(p.breed)],
  ['cow', /\b(cows?|cattle|calf|calves)\b/, 'cows', (p) => /\bcow\b/i.test(p.breed)],
  ['farm animal', /\b(farm animals?|livestock|pigs?|piglets?|sheep|lambs?|chickens?|hens?|roosters?|ducks?|geese|goose|alpacas?|llamas?)\b/, 'farm animals', (p) => p.type === 'Farm Animal' || /\b(pig|sheep|chicken|hen|duck|goose|alpaca|llama)\b/i.test(p.breed)],
];
const WILD = /\b(elephants?|lions?|tigers?|bears?|wolf|wolves|fox(es)?|monkeys?|apes?|gorillas?|chimps?|giraffes?|zebras?|hippos?|rhinos?|kangaroos?|koalas?|wombats?|possums?|echidnas?|platypus|crocodiles?|alligators?|sharks?|dolphins?|whales?|penguins?|owls?|eagles?|deer|camels?|cheetahs?|leopards?|jaguars?|pandas?|sloths?|squirrels?|bats?|dinosaurs?|dragons?|unicorns?)\b/;

function speciesSummary(pets) {
  const counts = {};
  pets.forEach((p) => {
    const kind = ANIMALS.find(([, , , test]) => test(p));
    const label = kind ? kind[0] : p.type === 'Other' ? 'other pet' : p.type.toLowerCase();
    counts[label] = (counts[label] || 0) + 1;
  });
  const plural = (w, n) => (n === 1 || w === 'fish' ? w : /(sh|ch|s|x)$/.test(w) ? `${w}es` : `${w}s`);
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${n} ${plural(w, n)}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || 'no pets';
}

// Works out which kinds of animal a message asks for and whether any are in the catalogue right now.
function animalRequest(message, pets) {
  const t = ` ${String(message).toLowerCase().replace(/[’']/g, '')} `.replace(/\b(my|our|have (a |an |two |2 )?|another|resident|not (a |an )?|no )(dog|puppy|cat|kitten)s?\b/g, ' ');
  const asked = ANIMALS.filter(([, re]) => re.test(t.replace(/\bguinea ?pigs?\b/g, (m) => (re.source.includes('guinea') ? m : ' '))))
    .map(([kind, , label, test]) => ({ kind, label, pets: pets.filter(test) }));
  const wild = (t.match(WILD) || [])[0] || null;
  return { asked, wild, missing: asked.filter((a) => !a.pets.length), found: asked.filter((a) => a.pets.length) };
}

// Replies for requests we can answer straight from the catalogue: animals we never rehome, or kinds we have none of.
function unavailableReply(req, pets) {
  const have = `Right now our partner shelters have ${speciesSummary(pets)} looking for homes.`;
  const cta = [{ label: 'See all pets', href: 'adopt.html' }];
  if (req.wild && !req.asked.length) {
    return { reply: `We don't have any ${req.wild.replace(/s$/, '')}s — PawPal only rehomes companion animals from Australian shelters, and wild animals aren't kept as pets. ${have} Would you like me to suggest one that suits your home?`, picks: [], actions: cta };
  }
  if (req.asked.length && !req.found.length) {
    const names = req.missing.map((a) => a.label);
    return { reply: `We don't have any ${names.join(' or ')} available for adoption at the moment. ${have} New animals arrive every week, so it's worth checking back — or tell me about your home and I'll suggest who could suit you.`, picks: [], actions: cta };
  }
  return null;
}

const GREETING = /^(hi+|hello+|hey+|hiya|howdy|gday|g day|good (morning|afternoon|evening|day)|yo|greetings|hey there|hi there|hello there)( pawpal| there| team| everyone)?[\s!.,:)]*$/;
const THANKS = /^(thanks?|thank you|thankyou|ty|cheers|ta|great|awesome|perfect|cool|nice|ok(ay)?|got it|sounds good)( so much| heaps| a lot| mate)?[\s!.,:)]*$/;
const BYE = /^(bye|goodbye|see ya|see you|cya|later)[\s!.,:)]*$/;

function rulesChat({ message, profile, pets, applications, user, lastPetIds = [], shelters = {} }) {
  const t = message.toLowerCase().replace(/[’']/g, '');
  const mentioned = nameMention(message, pets);
  const pick = (m) => ({ pet: m.pet, score: m.score, reasons: m.reasons, considerations: m.considerations });
  const plain = t.trim();

  // 0. Greetings and small talk never trigger pet suggestions
  if (GREETING.test(plain)) {
    return { reply: `Hi${user ? ` ${user.name.split(' ')[0]}` : ''}! I'm PawPal's adoption assistant. We have ${speciesSummary(pets)} looking for homes right now. Tell me a little about your home and routine and I'll suggest who could suit you — or ask me about a pet, the adoption process, or your application.`, picks: [] };
  }
  if (THANKS.test(plain)) return { reply: 'You\'re welcome! Let me know if you\'d like more suggestions or help with an application.', picks: [] };
  if (BYE.test(plain)) return { reply: 'Bye for now — good luck finding your new best friend!', picks: [] };

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

  // 3b. Kinds of animal we don't have (elephants, birds when none are listed…)
  const unavailable = unavailableReply(animalRequest(message, pets), pets);
  if (unavailable) return unavailable;

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
  const req = animalRequest(message, pets);
  const aboutFinding = lifestyle || req.found.length || /^(yes|yeah|yep|no|nope|nah|sure|maybe|both|either|any|none|[0-9]+( hours?| hrs?)?)\b/.test(plain)
    || /\b(pets?|animals?|companion|adopt|available|have|options|more)\b/.test(t);
  // Asking for a kind of animal we have ("any snakes?") is enough to show them, even before we know the person's lifestyle
  if ((hasProfile && aboutFinding) || req.found.length || /\b(recommend|suggest|suit|match|best|which (dogs?|cats?|pets?)|show me|looking for|want a|find me)\b/.test(t)) {
    let pool = req.found.length ? [...new Set(req.found.flatMap((a) => a.pets))] : pets;
    if (profile.location) {
      const local = pool.filter((p) => p.location.toLowerCase().includes(profile.location.toLowerCase()));
      if (local.length) pool = local;
    }
    const top = rankPets(pool, req.found.length ? { ...profile, preferredType: null } : profile, 3);
    if (!top.length) return { reply: 'There aren\'t any pets that fit right now, but new animals arrive every week. Try widening what you\'re looking for.', picks: [] };
    const understood = describeProfile(profile);
    const intro = understood.length ? `Here's what I understood: ${understood.slice(0, 5).join(', ').toLowerCase()}.` : 'Here are some lovely pets available right now.';
    const list = top.map((m) => `• ${m.pet.name} (${m.pet.breed}) — ${m.score}% match${m.reasons[0] ? `: ${m.reasons[0].charAt(0).toLowerCase()}${m.reasons[0].slice(1)}` : ''}`).join('\n');
    const notHere = [...req.missing.map((a) => a.label), ...(req.wild ? [`${req.wild.replace(/s$/, '')}s`] : [])];
    const note = notHere.length ? `We don't have any ${notHere.join(' or ')} at the moment, but here's who is available.\n\n` : '';
    return { reply: `${note}${intro}\n\n${list}\n\n${nextQuestion(profile)}`, picks: top.map(pick) };
  }

  return { reply: 'I can help you find a compatible pet, tell you about a specific pet, explain the adoption process, or check your application status. Try something like "I live in an apartment and want a calm dog".', picks: [] };
}

async function chat(ctx) {
  const { message, history = [], prevProfile = {}, pets, applications = [], user, lastPetIds = [], shelters = {} } = ctx;
  const locations = [...new Set(pets.map((p) => p.location).filter(Boolean))];
  // The profile comes from PawPal's own parser so each chat message needs only one model call
  const profile = parseProfile(message, prevProfile, locations);
  const rules = rulesChat({ message, profile, pets, applications, user, lastPetIds, shelters });
  if (!llm.llmEnabled) return { ...rules, profile, source: 'rules' };
  // Greetings, small talk and animals we don't have are answered straight from the catalogue — no pet list
  const plain = message.toLowerCase().replace(/[’']/g, '').trim();
  const req = animalRequest(message, pets);
  if (GREETING.test(plain) || THANKS.test(plain) || BYE.test(plain) || unavailableReply(req, pets)) return { ...rules, profile, source: 'rules' };

  try {
    const candidates = rankPets(req.found.length ? [...new Set(req.found.flatMap((a) => a.pets))] : pets, req.found.length ? { ...profile, preferredType: null } : profile, 8).map((m) => ({ ...promptPet(m.pet), matchScore: m.score, reasons: m.reasons, considerations: m.considerations }));
    const myApps = applications.map((a) => ({ pet: a.petName, status: a.status, meaning: APP_STATUS_INFO[a.status], appointment: a.appointmentAt, updated: a.updatedAt }));
    const raw = await llm.complete({ json: true, maxTokens: 700,
      system: `You are PawPal's adoption assistant for Australian animal shelters. Help people find compatible pets, answer questions about specific pets and the adoption process, and explain application status. ${GUARDRAILS}
Keep replies under 120 words; plain text with simple "•" bullets when listing. Recommend at most 3 pets and include their ids in petIds. When recommending, prefer the ranked candidates and quote their matchScore as the match percentage.
Always answer the latest message. rankedCandidates already reflect the adopter's current wishes: if they change what they want (for example cats to dogs, or a different size or age), recommend pets that fit the new request and do not repeat earlier suggestions unless they ask about them. Only recommend pets whose type matches the kind of animal they asked for. If the user asks about their application and "myApplications" is empty or the user is not logged in, say so.
"availableNow" lists every kind of animal currently in the catalogue. If they ask for a kind of animal that isn't there, say plainly that PawPal doesn't have any right now and mention what is available; never suggest a different kind of animal as if it were what they asked for. Only suggest pets (petIds) when the message is about finding or learning about a pet — for greetings, thanks or general questions return an empty petIds list.
Return {"reply": string, "petIds": string[]}.
Adoption FAQ: ${JSON.stringify(FAQ.map((f) => ({ q: f.q, a: f.a })))}`,
      messages: [
        { role: 'user', content: `DATA (from the PawPal database):\n${JSON.stringify({ loggedIn: Boolean(user), firstName: user?.name?.split(' ')[0],
          understoodLifestyle: describeProfile(profile), availableNow: speciesSummary(pets), rankedCandidates: candidates, catalogue: pets.slice(0, 60).map(promptPet), myApplications: user ? myApps : undefined })}` },
        { role: 'assistant', content: '{"reply":"Understood — I will only use this data.","petIds":[]}' },
        ...history.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, 800) })),
        { role: 'user', content: message },
      ] });
    const ids = Array.isArray(raw.petIds) ? raw.petIds : [];
    const wantedType = ['dog', 'cat', 'other'].includes(profile.preferredType) ? profile.preferredType : null;
    const foundSet = req.found.length ? new Set(req.found.flatMap((a) => a.pets)) : null;
    const typeOk = (pet) => (foundSet ? foundSet.has(pet) : !wantedType || (wantedType === 'other' ? !['dog', 'cat'].includes(String(pet.type).toLowerCase()) : String(pet.type).toLowerCase() === wantedType));
    // Never show pets of a different kind than the adopter asked for (a pet they name explicitly is still allowed)
    const named = nameMention(message, pets);
    const picks = ids.map((id) => pets.find((p) => p.id === id)).filter(Boolean).filter((pet) => typeOk(pet) || pet === named).slice(0, 3)
      .map((pet) => ({ pet, ...evaluateMatch(pet, profile) }));
    if (ids.length && !picks.length) return { ...rules, profile, source: 'rules' };
    return { reply: String(raw.reply || rules.reply).slice(0, 1500), picks, actions: rules.actions, profile, source: llm.provider };
  } catch (err) {
    if (!err.quiet) console.warn('AI chat fallback:', err.message.split('\n')[0].slice(0, 160));
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
    if (!err.quiet) console.warn('Shelter assistant fallback:', err.message.split('\n')[0].slice(0, 160));
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

module.exports = { comparePets, templateCompare, promotePost, templatePost, PLATFORMS, TONES, describePet, templateDescription, understandLifestyle, explainMatches, profileToFilters, describeFilters,
  chat, explainQuestion, shelterAssistant, summarizeApplication, insights, promptPet, SOURCE };
