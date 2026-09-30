// PawPal compatibility engine.
// 1. parseProfile() turns what an adopter writes ("I work 9 to 5 in an apartment…") into a lifestyle profile.
// 2. evaluateMatch() compares that profile with a pet's shelter-provided facts and returns a score,
//    the reasons it fits and the things worth considering. The score is deterministic and explainable;
//    the language model (when configured) only helps with reading free text and wording explanations.
const db = require('../db');
const { notify } = require('./notify');

const STATES = { vic: 'VIC', victoria: 'VIC', nsw: 'NSW', 'new south wales': 'NSW', qld: 'QLD', queensland: 'QLD',
  wa: 'WA', 'western australia': 'WA', sa: 'SA', 'south australia': 'SA', tas: 'TAS', tasmania: 'TAS', act: 'ACT', nt: 'NT' };
const CITY_STATE = { melbourne: 'VIC', sydney: 'NSW', brisbane: 'QLD', perth: 'WA', adelaide: 'SA', hobart: 'TAS', canberra: 'ACT', darwin: 'NT',
  geelong: 'VIC', ballarat: 'VIC', bendigo: 'VIC', 'gold coast': 'QLD', newcastle: 'NSW', wollongong: 'NSW' };

const TEMPERAMENTS = ['calm', 'quiet', 'gentle', 'playful', 'affectionate', 'cuddly', 'friendly', 'smart', 'loyal', 'independent', 'active', 'curious', 'social'];

const emptyProfile = () => ({ homeType: null, hasYard: null, activity: null, experience: null, hoursAlone: null, hasChildren: null,
  hasOtherPets: null, preferredType: null, size: [], age: [], temperament: [], location: null });

function parseProfile(text, prev = {}, knownLocations = []) {
  const t = ` ${String(text || '').toLowerCase().replace(/[’']/g, '').replace(/\bdoes not\b/g, 'doesnt').replace(/\bdo not\b/g, 'dont')
    .replace(/\bhave not\b/g, 'havent').replace(/\bi am\b/g, 'im')} `;
  const p = { ...emptyProfile(), ...prev };
  const has = (re) => re.test(t);

  // Home
  if (has(/\b(apartment|flat|unit|studio|condo|townhouse|high[- ]rise)\b/)) { p.homeType = 'apartment'; p.hasYard = has(/\b(balcony|courtyard)\b/) ? false : p.hasYard ?? false; }
  if (has(/\b(house|home with a yard|backyard|back yard|garden|yard)\b/) && !has(/\bno (back ?)?yard\b|\bwithout a yard\b/)) { p.homeType = p.homeType === 'apartment' && !has(/\bhouse\b/) ? 'apartment' : 'house'; if (has(/\b(yard|garden|backyard)\b/)) p.hasYard = true; }
  if (has(/\bno (back ?)?yard\b|\bwithout a yard\b|\bdont have a yard\b/)) p.hasYard = false;
  if (has(/\b(farm|acreage|rural|paddock|property in the country)\b/)) { p.homeType = 'farm'; p.hasYard = true; }

  // Activity
  if (has(/\b(very active|run|running|marathon|hike|hiking|jog|jogging|sporty|athletic|cycling|trail)\b/)) p.activity = 3;
  else if (has(/\b(not (too|very|extremely) active|doesnt (require|need) (extremely |very |too )?(high|much|lots of) exercise|low[- ]maintenance|moderate|moderately active|fairly active|daily walks?|short walks?|balanced|some exercise)\b/)) p.activity = 2;
  if (has(/\b(relaxed|homebody|lazy|couch|quiet life|low energy|not active|sedentary|retired|elderly|limited mobility)\b/)) p.activity = 1;
  if (p.activity === null && has(/\b(active|energetic|outdoorsy|adventur)/)) p.activity = 3;

  // Experience
  if (has(/\b(first[- ]time|never (owned|had)|new to (dogs|cats|pets)|no experience|havent owned|beginner)\b/)) p.experience = 'first';
  else if (has(/\b(grew up with|had (a )?(dogs?|cats?|pets?) before|some experience|owned (a )?(dogs?|cats?) before)\b/)) p.experience = 'some';
  if (has(/\b(experienced|years of experience|trained dogs|foster(ed|ing)?|vet nurse|dog trainer)\b/)) p.experience = 'experienced';

  // Schedule / time alone
  if (has(/\b(9 ?(to|-|–) ?5|nine to five|full[- ]time|office job|long hours|work away|commute|out all day)\b/)) p.hoursAlone = 8;
  if (has(/\b(part[- ]time)\b/)) p.hoursAlone = 5;
  if (has(/\b(work from home|wfh|home all day|remote(ly)?|retired|stay[- ]at[- ]home)\b/)) p.hoursAlone = 2;
  const hrs = t.match(/\b(\d{1,2}) ?(hours|hrs)\b.*\b(alone|away|by (itself|themselves))\b|\balone (for )?(\d{1,2}) ?(hours|hrs)\b/);
  if (hrs) p.hoursAlone = Math.min(24, Number(hrs[1] || hrs[5]));

  // Household
  if (has(/\b(no (kids|children)|dont have (any )?(kids|children)|child[- ]free|just me|live alone|couple without kids)\b/)) p.hasChildren = false;
  else if (has(/\b(kids?|children|child|toddlers?|baby|babies|son|daughter|family with)\b/)) p.hasChildren = true;
  if (has(/\b(no other pets?|dont have (any )?(other )?pets|only pet)\b/)) p.hasOtherPets = false;
  else if (has(/\b(other pets?|another (dog|cat)|have (a |two |2 )?(dogs?|cats?)|my (dog|cat)|our (dog|cat)|resident (dog|cat))\b/)) p.hasOtherPets = true;

  // Species (explicit wish, not other pets in the home)
  const wantsDog = has(/\b(want|looking for|adopt|like|after|prefer|hoping for|find)\b[^.]{0,40}\b(dog|puppy|pup|pooch)s?\b/) || has(/\b(calm|friendly|small|big|large|active|quiet|gentle|playful|senior|young|older) (dog|puppy)\b/);
  const wantsCat = has(/\b(want|looking for|adopt|like|after|prefer|hoping for|find)\b[^.]{0,40}\b(cat|kitten|kitty)s?\b/) || has(/\b(calm|friendly|small|affectionate|active|quiet|gentle|playful|senior|young|older|indoor) (cat|kitten)\b/);
  const wantsOther = has(/\b(rabbit|bunny|bunnies|guinea pig|bird|budgie|small pet|small animal)s?\b/);
  if (wantsDog && !wantsCat) p.preferredType = 'dog';
  else if (wantsCat && !wantsDog) p.preferredType = 'cat';
  else if (wantsOther && !wantsDog && !wantsCat) p.preferredType = 'other';
  else if (has(/\b(any pet|open to (any|anything)|dont mind (what|which))\b/)) p.preferredType = 'any';
  if (!p.preferredType) {
    const dog = has(/\b(dog|puppy|pup)s?\b/); const cat = has(/\b(cat|kitten)s?\b/);
    if (dog && !cat && !p.hasOtherPets) p.preferredType = 'dog';
    if (cat && !dog && !p.hasOtherPets) p.preferredType = 'cat';
  }

  // Size & age preferences
  const size = new Set(p.size || []);
  if (has(/\b(small|little|tiny|toy|compact)\b/)) size.add('small');
  if (has(/\b(medium[- ]sized|medium)\b/)) size.add('medium');
  if (has(/\b(large|big|giant)\b (dog|breed|cat)/)) size.add('large');
  p.size = [...size];
  const age = new Set(p.age || []);
  if (has(/\b(puppy|puppies|kitten|kittens|baby)\b/)) age.add('baby');
  if (has(/\b(young|youthful)\b (dog|cat|pet)/)) age.add('young');
  if (has(/\b(adult)\b (dog|cat|pet)/)) age.add('adult');
  if (has(/\b(senior|older|elderly)\b (dog|cat|pet)/)) age.add('senior');
  p.age = [...age];

  // Temperament words
  const temp = new Set(p.temperament || []);
  TEMPERAMENTS.forEach((w) => { if (has(new RegExp(`\\b${w}`))) temp.add(w); });
  if (has(/\bdoesnt (require|need) (extremely |very |too )?(high|much) exercise\b|\blow energy\b/)) temp.add('calm');
  p.temperament = [...temp];

  // Location — known pet locations first, then states/cities
  const loc = knownLocations.find((l) => { const suburb = l.split(',')[0].trim().toLowerCase(); return suburb.length > 2 && t.includes(` ${suburb}`); });
  if (loc) p.location = loc.split(',')[0].trim();
  else {
    const city = Object.keys(CITY_STATE).find((c) => t.includes(` ${c}`));
    const state = Object.keys(STATES).find((s) => new RegExp(`\\b${s}\\b`).test(t));
    if (city) p.location = CITY_STATE[city];
    else if (state) p.location = STATES[state];
  }
  return p;
}

// Merge a profile from the language model with the rule-based one, accepting only valid values.
function sanitizeProfile(raw = {}, base = emptyProfile()) {
  const p = { ...emptyProfile(), ...base };
  const oneOf = (v, list) => (list.includes(v) ? v : undefined);
  const set = (k, v) => { if (v !== undefined && v !== null) p[k] = v; };
  set('homeType', oneOf(raw.homeType, ['apartment', 'house', 'farm']));
  if (typeof raw.hasYard === 'boolean') p.hasYard = raw.hasYard;
  set('activity', oneOf(Number(raw.activity), [1, 2, 3]));
  set('experience', oneOf(raw.experience, ['first', 'some', 'experienced']));
  if (Number.isFinite(Number(raw.hoursAlone)) && raw.hoursAlone !== null && raw.hoursAlone !== '') p.hoursAlone = Math.max(0, Math.min(24, Number(raw.hoursAlone)));
  if (typeof raw.hasChildren === 'boolean') p.hasChildren = raw.hasChildren;
  if (typeof raw.hasOtherPets === 'boolean') p.hasOtherPets = raw.hasOtherPets;
  set('preferredType', oneOf(raw.preferredType, ['dog', 'cat', 'other', 'any']));
  if (Array.isArray(raw.size)) p.size = [...new Set([...p.size, ...raw.size.filter((s) => ['small', 'medium', 'large'].includes(s))])];
  if (Array.isArray(raw.age)) p.age = [...new Set([...p.age, ...raw.age.filter((s) => ['baby', 'young', 'adult', 'senior'].includes(s))])];
  if (Array.isArray(raw.temperament)) p.temperament = [...new Set([...p.temperament, ...raw.temperament.map((s) => String(s).toLowerCase().slice(0, 20)).filter((s) => TEMPERAMENTS.includes(s))])];
  if (typeof raw.location === 'string' && raw.location.trim()) p.location = raw.location.trim().slice(0, 40);
  return p;
}

// Human-readable summary of what PawPal understood
function describeProfile(p) {
  const out = [];
  if (p.homeType) out.push({ apartment: 'Lives in an apartment', house: p.hasYard ? 'House with a yard' : 'Lives in a house', farm: 'Rural property' }[p.homeType]);
  else if (p.hasYard === false) out.push('No yard');
  if (p.activity) out.push(['Relaxed lifestyle', 'Moderately active', 'Very active'][p.activity - 1]);
  if (p.hoursAlone !== null && p.hoursAlone !== undefined) out.push(p.hoursAlone >= 8 ? 'Away most of the workday' : p.hoursAlone <= 3 ? 'Home most of the day' : `Pet alone ~${p.hoursAlone} hrs`);
  if (p.experience) out.push({ first: 'First-time owner', some: 'Some pet experience', experienced: 'Experienced owner' }[p.experience]);
  if (p.hasChildren !== null && p.hasChildren !== undefined) out.push(p.hasChildren ? 'Children at home' : 'No children');
  if (p.hasOtherPets !== null && p.hasOtherPets !== undefined) out.push(p.hasOtherPets ? 'Has other pets' : 'No other pets');
  if (p.preferredType && p.preferredType !== 'any') out.push({ dog: 'Looking for a dog', cat: 'Looking for a cat', other: 'Looking for a small pet' }[p.preferredType]);
  if (p.size?.length) out.push(`Prefers ${p.size.join('/')} size`);
  if (p.age?.length) out.push(`Prefers ${p.age.map((a) => ({ baby: 'puppy/kitten', young: 'young', adult: 'adult', senior: 'senior' }[a])).join('/')} pets`);
  if (p.temperament?.length) out.push(`Wants: ${p.temperament.slice(0, 3).join(', ')}`);
  if (p.location) out.push(`Near ${p.location}`);
  return out;
}

const known = (v) => v !== null && v !== undefined;
const AGE_BAND = (age) => (age < 1 ? 'baby' : age <= 2 ? 'young' : age <= 7 ? 'adult' : 'senior');

function evaluateMatch(pet, p) {
  const parts = [];
  const reasons = [];
  const considerations = [];
  const add = (weight, fit) => parts.push([weight, fit]);
  const energy = Number(pet.energyLevel) || 2;
  const energyWord = ['calm', 'moderate', 'high'][energy - 1];
  const isDog = pet.type === 'Dog';

  // Species preference
  if (p.preferredType && p.preferredType !== 'any') {
    const ok = p.preferredType === 'other' ? !['Dog', 'Cat'].includes(pet.type) : pet.type.toLowerCase() === p.preferredType;
    add(20, ok ? 1 : 0);
  } else add(20, 0.85);

  // Home
  const yard = p.hasYard === true || p.homeType === 'farm';
  if (pet.requiresYard) {
    if (yard) { add(20, 1); reasons.push('You have the outdoor space the shelter says they need'); }
    else if (p.homeType === 'apartment' || p.hasYard === false) { add(20, 0.15); considerations.push('The shelter notes this pet needs a secure yard'); }
    else add(20, 0.6);
  } else if (p.homeType === 'apartment') {
    if (energy <= 2 && pet.size !== 'Large') { add(20, 1); reasons.push('Suited to apartment living'); }
    else { add(20, 0.55); considerations.push(`${pet.size === 'Large' ? 'Large' : 'High-energy'} pets need plenty of outings when living in an apartment`); }
  } else add(20, known(p.homeType) ? 0.95 : 0.75);

  // Activity
  if (known(p.activity)) {
    const diff = Math.abs(energy - p.activity);
    add(20, [1, 0.55, 0.1][diff]);
    if (diff === 0) reasons.push(`Their ${energyWord} energy matches your lifestyle`);
    else if (energy > p.activity) considerations.push(`${pet.name} has ${energyWord} energy — more exercise than you described`);
    else if (diff === 2) considerations.push(`${pet.name} is calmer than your active lifestyle`);
  } else add(20, 0.7);

  // Children
  if (p.hasChildren === true) {
    if (pet.goodWithChildren) { add(15, 1); reasons.push('The shelter says they are good with children'); }
    else { add(15, 0); considerations.push('The shelter recommends a home without young children'); }
  } else if (p.hasChildren === false) add(15, 1);
  else { add(15, pet.goodWithChildren ? 0.9 : 0.6); if (!pet.goodWithChildren) considerations.push('Not recommended for homes with young children'); }

  // Other pets
  if (p.hasOtherPets === true) {
    if (pet.goodWithOtherPets) { add(10, 1); reasons.push('Gets along with other animals'); }
    else { add(10, 0.1); considerations.push('The shelter suggests they be the only pet'); }
  } else add(10, p.hasOtherPets === false ? 1 : 0.85);

  // Experience
  const demanding = energy === 3 || pet.specialNeeds || (isDog && pet.size === 'Large' && energy >= 2);
  if (p.experience === 'first') {
    if (!demanding && (pet.firstTimeFriendly || energy <= 2)) { add(10, 1); reasons.push('A good fit for a first-time owner'); }
    else { add(10, 0.35); considerations.push('May suit someone with previous pet experience'); }
  } else if (p.experience) add(10, 1);
  else add(10, demanding ? 0.7 : 0.85);

  // Time alone
  if (known(p.hoursAlone)) {
    if (p.hoursAlone >= 8) {
      if (energy === 3 && isDog) { add(8, 0.15); considerations.push('A high-energy dog alone for a full workday may struggle — a dog walker or daycare would help'); }
      else if (isDog) { add(8, 0.6); considerations.push('Dogs usually need a midday break on long workdays'); }
      else { add(8, 1); reasons.push('Independent enough for your work schedule'); }
    } else { add(8, 1); if (p.hoursAlone <= 3) reasons.push('You are home often, which helps them settle'); }
  } else add(8, 0.8);

  // Size, age and temperament preferences
  if (p.size?.length) { const ok = p.size.includes(pet.size.toLowerCase()); add(6, ok ? 1 : 0.3); if (ok) reasons.push(`${pet.size} size, as you prefer`); }
  if (p.age?.length) { const ok = p.age.includes(AGE_BAND(pet.age)); add(5, ok ? 1 : 0.35); }
  if (p.temperament?.length) {
    const traits = (pet.traits || []).map((x) => x.toLowerCase());
    const calmWanted = p.temperament.some((w) => ['calm', 'quiet', 'gentle'].includes(w));
    const hits = p.temperament.filter((w) => traits.some((x) => x.includes(w)) || (w === 'calm' && energy === 1) || (w === 'friendly' && pet.goodWithChildren && pet.goodWithOtherPets));
    add(6, hits.length ? 1 : calmWanted && energy === 3 ? 0.1 : 0.5);
    if (hits.length) reasons.push(`Described as ${hits.slice(0, 2).join(' and ')}`);
  }
  if (p.location) {
    const inArea = `${pet.location}`.toLowerCase().includes(p.location.toLowerCase());
    add(4, inArea ? 1 : 0.5);
    if (inArea) reasons.push(`Located in ${pet.location}`);
  }
  if (pet.status === 'On Hold') considerations.push('Another adopter is already meeting this pet — they are on hold');

  const total = parts.reduce((s, [w]) => s + w, 0);
  const score = Math.round((parts.reduce((s, [w, f]) => s + w * f, 0) / total) * 100);
  // Never show 100% — a match score is guidance, not a guarantee of behaviour
  return { score: Math.max(5, Math.min(97, score)), reasons: [...new Set(reasons)].slice(0, 4), considerations: [...new Set(considerations)].slice(0, 3) };
}

// Rank pets for a profile. When a species is requested, other species are left out unless nothing fits.
function rankPets(pets, profile, limit = 6) {
  let pool = pets;
  if (profile.preferredType && profile.preferredType !== 'any') {
    const typed = pets.filter((p) => (profile.preferredType === 'other' ? !['Dog', 'Cat'].includes(p.type) : p.type.toLowerCase() === profile.preferredType));
    if (typed.length) pool = typed;
  }
  return pool.map((pet) => ({ pet, ...evaluateMatch(pet, profile) }))
    .sort((a, b) => b.score - a.score || (a.pet.status === 'On Hold') - (b.pet.status === 'On Hold'))
    .slice(0, limit);
}

const profileIsEmpty = (p) => describeProfile(p).length === 0;

// When a new pet is published, tell adopters whose saved lifestyle profile strongly matches it.
async function notifyNewMatches(pet) {
  const users = (await db.find('users', { role: 'user' })).filter((u) => u.active !== false && u.preferences && !profileIsEmpty(u.preferences));
  let sent = 0;
  for (const u of users) {
    const { score } = evaluateMatch(pet, u.preferences);
    if (score >= 80) {
      await notify(u.id, { type: 'match', title: `New match: ${pet.name} (${score}%)`,
        message: `${pet.name} the ${pet.breed} was just listed and looks like a strong fit for the lifestyle you described.`, link: `pet-profile.html?id=${pet.id}` });
      sent++;
    }
  }
  return sent;
}

module.exports = { parseProfile, sanitizeProfile, describeProfile, evaluateMatch, rankPets, emptyProfile, profileIsEmpty,
  notifyNewMatches, AGE_BAND, TEMPERAMENTS };
