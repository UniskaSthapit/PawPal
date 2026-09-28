// FR-08 AI-Based Adopter Suitability Ranking
// Follows "Pseudocode 1" in the PawPal proposal exactly: 5 checks, max 100 points.
// FR-05 pet matching reuses the same compatibility idea from the adopter's side.

const LIVING_TYPES = ['House with yard', 'House without yard', 'Apartment', 'Farm / acreage'];
const EXPERIENCE = ['First-time owner', 'Some experience', 'Experienced'];
const REQUIRED = ['livingType', 'activityLevel', 'hasChildren', 'hasOtherPets', 'experience', 'hoursAlone'];

function calculateSuitabilityScore(inquiry, pet) {
  const missing = REQUIRED.filter((f) => inquiry[f] === undefined || inquiry[f] === null || inquiry[f] === '');
  if (missing.length) return { error: 'Incomplete inquiry. Cannot calculate score.' };

  let total = 0;
  const breakdown = [];
  const add = (points, text) => { total += points; breakdown.push({ points, text }); };
  const hasYard = inquiry.livingType === 'House with yard' || inquiry.livingType === 'Farm / acreage';

  // 1. Living situation (max 25)
  if (pet.requiresYard && hasYard) add(25, 'Living situation: ideal match');
  else if (!pet.requiresYard && (inquiry.livingType === 'Apartment' || hasYard || inquiry.livingType === 'House without yard'))
    add(20, 'Living situation: suitable match');
  else add(5, 'Living situation: poor match — pet needs a yard');

  // 2. Activity level (max 25) — both on a 1 (relaxed) to 3 (very active) scale
  const diff = Math.abs(Number(pet.energyLevel || 2) - Number(inquiry.activityLevel));
  if (diff === 0) add(25, 'Activity level: perfect match');
  else if (diff === 1) add(15, 'Activity level: partial match');
  else add(0, 'Activity level: mismatch');

  // 3. Children (max 20)
  if (inquiry.hasChildren && !pet.goodWithChildren) add(0, 'Children: HIGH RISK — pet not good with children');
  else if (inquiry.hasChildren) add(20, 'Children: compatible');
  else add(20, 'Children: no conflict');

  // 4. Other pets (max 15)
  if (!inquiry.hasOtherPets) add(15, 'Other pets: no conflict');
  else if (pet.goodWithOtherPets) add(15, 'Other pets: compatible');
  else add(5, 'Other pets: possible conflict');

  // 5. Experience (max 15)
  if (inquiry.experience === 'Experienced') add(15, 'Experience: experienced owner');
  else if (inquiry.experience === 'Some experience') add(10, 'Experience: some experience');
  else add(5, 'Experience: first-time owner — may need extra support');

  total = Math.min(100, total);
  const label = total >= 80 ? 'High Match' : total >= 60 ? 'Medium Match' : 'Low Match';

  // Extra staff note (not scored, same as proposal: kept for transparency)
  const notes = [];
  if (Number(inquiry.hoursAlone) >= 8 && Number(pet.energyLevel) >= 3) notes.push('Pet would be alone 8+ hours and is high-energy.');
  return { score: total, label, breakdown, notes };
}

// FR-05 — rank pets for an adopter's quiz answers (0–100)
function petMatchScore(pet, a) {
  let s = 0;
  const hasYard = a.homeType === 'house' || a.homeType === 'farm';
  if (pet.requiresYard) s += hasYard ? 25 : 5; else s += a.homeType === 'apartment' ? 25 : 20;
  const diff = Math.abs(Number(pet.energyLevel || 2) - Number(a.activity || 2));
  s += diff === 0 ? 25 : diff === 1 ? 15 : 0;
  s += a.hasChildren ? (pet.goodWithChildren ? 20 : 0) : 20;
  s += a.hasOtherPets ? (pet.goodWithOtherPets ? 15 : 5) : 15;
  if (!a.preferredType || a.preferredType === 'any') s += 15;
  else if (a.preferredType === 'other') s += ['Dog', 'Cat'].includes(pet.type) ? 0 : 15;
  else s += pet.type.toLowerCase() === a.preferredType.toLowerCase() ? 15 : 0;
  if (a.hoursAlone >= 8 && Number(pet.energyLevel) >= 3) s -= 10;
  return Math.max(0, Math.min(100, s));
}

function matchReasons(pet, a) {
  const r = [];
  if (!pet.requiresYard && a.homeType === 'apartment') r.push('happy in apartments');
  if (pet.requiresYard && a.homeType !== 'apartment') r.push('will love your outdoor space');
  if (Number(pet.energyLevel) === Number(a.activity)) r.push(['calm', 'balanced', 'high'][pet.energyLevel - 1] + ' energy like you');
  if (a.hasChildren && pet.goodWithChildren) r.push('great with kids');
  if (a.hasOtherPets && pet.goodWithOtherPets) r.push('gets along with other pets');
  return r.slice(0, 2);
}

module.exports = { calculateSuitabilityScore, petMatchScore, matchReasons, LIVING_TYPES, EXPERIENCE };
