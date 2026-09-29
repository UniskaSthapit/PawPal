// FR-08 AI-Based Adopter Suitability Ranking
// Follows "Pseudocode 1" in the PawPal proposal exactly: 5 checks, max 100 points.
// Pet matching for adopters lives in matching.js.

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

module.exports = { calculateSuitabilityScore, LIVING_TYPES, EXPERIENCE };
