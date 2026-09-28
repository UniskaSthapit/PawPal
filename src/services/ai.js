// AI service — FR-02 (pet descriptions) and FR-10 (chatbot recommendations).
// Uses OpenAI when OPENAI_API_KEY is set; otherwise PawPal's built-in rule-based AI,
// so every AI feature still works during development and demos.
const config = require('../config');
const { petMatchScore, matchReasons } = require('./scoring');

const aiEnabled = Boolean(config.openaiKey);

async function openaiChat(messages, { json = false, maxTokens = 400 } = {}) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.openaiModel,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ---------------- FR-02: pet description ----------------
function templateDescription(pet) {
  const name = pet.name || 'This sweetheart';
  const traits = (pet.traits || []).map((t) => t.toLowerCase());
  const ageText = pet.age ? `${pet.age}-year-old` : 'young';
  const breed = pet.breed || (pet.type || 'pet').toLowerCase();
  const energy = ['a relaxed companion who loves slow mornings and cosy naps',
    'a balanced friend who enjoys a good walk as much as a quiet evening in',
    'a bundle of energy who lives for play, adventures and zoomies'][(Number(pet.energyLevel) || 2) - 1];
  const kids = pet.goodWithChildren ? ` ${name} is gentle with children, making them a lovely family pet.` : '';
  const others = pet.goodWithOtherPets ? ` They get along well with other animals too.` : ' They would do best as the only pet in the home.';
  const home = pet.requiresYard ? ' A home with a secure yard would be perfect.' : ' They would settle happily into an apartment or house.';
  const traitLine = traits.length ? ` Friends at the shelter describe ${name} as ${traits.slice(0, -1).join(', ')}${traits.length > 1 ? ' and ' : ''}${traits.slice(-1)}.` : '';
  return `Meet ${name}, a ${ageText} ${breed} and ${energy}.${traitLine}${kids}${others}${home} ` +
    `Could your home be the one ${name} has been waiting for?`;
}

async function describePet(pet) {
  if (!aiEnabled) return { text: templateDescription(pet), source: 'pawpal-rules' };
  try {
    const text = await openaiChat([
      { role: 'system', content: 'You write warm, honest pet adoption bios for an Australian animal shelter. 90-130 words, third person, no emojis, no invented medical facts, end with an inviting question.' },
      { role: 'user', content: `Write a bio for this pet: ${JSON.stringify({
        name: pet.name, type: pet.type, breed: pet.breed, age: pet.age, gender: pet.gender, size: pet.size,
        personality: pet.traits, energyLevel: ['low', 'medium', 'high'][(pet.energyLevel || 2) - 1],
        goodWithChildren: pet.goodWithChildren, goodWithOtherPets: pet.goodWithOtherPets, needsYard: pet.requiresYard })}` },
    ]);
    return { text: text || templateDescription(pet), source: 'openai' };
  } catch (err) {
    console.warn('AI description fallback:', err.message);
    return { text: templateDescription(pet), source: 'pawpal-rules' };
  }
}

// ---------------- FR-10: chatbot ----------------
// Reads preferences out of free text, e.g. "I live in a small flat with two kids"
function extractPreferences(text, prev = {}) {
  const t = text.toLowerCase();
  const p = { ...prev };
  if (/\b(apartment|flat|unit|studio|small space|condo)\b/.test(t)) p.homeType = 'apartment';
  if (/\b(house|backyard|back yard|yard|garden)\b/.test(t)) p.homeType = 'house';
  if (/\b(farm|acreage|property|rural|paddock)\b/.test(t)) p.homeType = 'farm';
  if (/\b(very active|run|running|hike|hiking|jog|sporty|active|energetic|outdoors)\b/.test(t)) p.activity = 3;
  if (/\b(moderate|walks?|balanced|sometimes)\b/.test(t)) p.activity = p.activity === 3 ? 3 : 2;
  if (/\b(relaxed|calm|quiet|lazy|chill|homebody|senior|elderly|low energy)\b/.test(t)) p.activity = 1;
  if (/\b(kids?|children|child|toddler|baby|family)\b/.test(t)) p.hasChildren = !/\bno (kids|children)\b/.test(t);
  if (/\b(other pets?|another dog|another cat|have a (dog|cat)|my (dog|cat))\b/.test(t)) p.hasOtherPets = !/\bno other pets?\b/.test(t);
  if (/\b(dog|puppy|pup)s?\b/.test(t) && !/\bcat\b/.test(t)) p.preferredType = 'dog';
  if (/\b(cat|kitten|kitty)s?\b/.test(t) && !/\bdog\b/.test(t)) p.preferredType = 'cat';
  if (/\b(rabbit|bunny|guinea pig|bird|small pet)\b/.test(t)) p.preferredType = 'other';
  if (/\b(work|office|long hours|full[- ]time|away)\b/.test(t)) p.hoursAlone = 8;
  return p;
}

function nextQuestion(p) {
  if (!p.homeType) return 'What kind of home do you live in — an apartment, a house with a yard, or a bigger property?';
  if (!p.activity) return 'How active is your lifestyle — very active, moderate, or more relaxed?';
  if (p.hasChildren === undefined) return 'Are there any children in your home?';
  if (p.hasOtherPets === undefined) return 'Do you already have other pets?';
  if (!p.preferredType) return 'Are you hoping for a dog, a cat, or are you open to any pet?';
  return 'Tell me anything else — like how long the pet would be alone each day — and I can fine-tune these picks.';
}

function rankPets(pets, prefs, limit = 3) {
  return pets
    .map((pet) => ({ pet, match: petMatchScore(pet, prefs), reasons: matchReasons(pet, prefs) }))
    .sort((a, b) => b.match - a.match)
    .slice(0, limit);
}

function ruleBasedReply(message, prefs, pets) {
  const greeting = /^(hi|hello|hey|g'?day|good (morning|afternoon|evening))\b/i.test(message.trim());
  const known = Object.keys(prefs).length;
  const top = rankPets(pets, prefs);
  if (greeting && known === 0) {
    return { reply: "Hi! I'm PawPal AI 🐾 I'll help you find a pet that suits your life. " + nextQuestion(prefs), picks: [] };
  }
  if (known === 0) {
    return { reply: "I'd love to help! Tell me a bit about your home and lifestyle. " + nextQuestion(prefs), picks: [] };
  }
  const intro = top.length
    ? `Based on what you've told me, here are my top picks: ${top.map((t) => `${t.pet.name} (${t.match}% match${t.reasons.length ? ', ' + t.reasons.join(', ') : ''})`).join('; ')}.`
    : "I couldn't find an available pet that fits just yet — new pets arrive every week!";
  return { reply: `${intro} ${nextQuestion(prefs)}`, picks: top };
}

async function chat({ message, history = [], prefs = {} }, pets) {
  const updatedPrefs = extractPreferences(message, prefs);
  if (!aiEnabled) return { ...ruleBasedReply(message, updatedPrefs, pets), prefs: updatedPrefs, source: 'pawpal-rules' };

  try {
    const catalogue = pets.map((p) => ({ id: p.id, name: p.name, type: p.type, breed: p.breed, age: p.age, size: p.size,
      traits: p.traits, energy: ['low', 'medium', 'high'][(p.energyLevel || 2) - 1], goodWithChildren: p.goodWithChildren,
      goodWithOtherPets: p.goodWithOtherPets, needsYard: p.requiresYard }));
    const raw = await openaiChat([
      { role: 'system', content: 'You are PawPal AI, a friendly pet adoption assistant for an Australian shelter. ' +
        'Ask short lifestyle questions (home, activity, children, other pets, time alone, preferred species) and recommend up to 3 pets ONLY from the catalogue. ' +
        'Never invent pets. Keep replies under 90 words. Reply as JSON: {"reply": string, "petIds": string[]}. ' +
        `Catalogue: ${JSON.stringify(catalogue)}` },
      ...history.slice(-10).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, 800) })),
      { role: 'user', content: message },
    ], { json: true });
    const parsed = JSON.parse(raw);
    const picks = (parsed.petIds || []).map((id) => pets.find((p) => p.id === id)).filter(Boolean).slice(0, 3)
      .map((pet) => ({ pet, match: petMatchScore(pet, updatedPrefs), reasons: matchReasons(pet, updatedPrefs) }));
    return { reply: parsed.reply || nextQuestion(updatedPrefs), picks, prefs: updatedPrefs, source: 'openai' };
  } catch (err) {
    console.warn('AI chat fallback:', err.message);
    return { ...ruleBasedReply(message, updatedPrefs, pets), prefs: updatedPrefs, source: 'pawpal-rules' };
  }
}

module.exports = { describePet, chat, rankPets, aiEnabled, templateDescription };
