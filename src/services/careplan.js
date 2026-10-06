// "First 30 days" care plan, created when an application is approved.
// Uses only the pet's public fields and the adopter's lifestyle answers (never names, contact details or staff notes).
// With a language model the wording is personalised; otherwise species templates from the rules engine are used.
// Either way it is general guidance, not veterinary advice.
const llm = require('./llm');

const DISCLAIMER = 'This is general guidance, not veterinary advice.';
const SECTIONS = [
  ['before', 'Before they come home'],
  ['days1to3', 'Days 1–3'],
  ['week1', 'Week 1'],
  ['weeks2to4', 'Weeks 2–4'],
  ['feeding', 'Feeding'],
  ['exercise', 'Exercise & enrichment'],
  ['vet', 'Vet & vaccinations'],
  ['training', 'Training & routine'],
  ['warning', 'Warning signs — call a vet'],
];
const KEYS = SECTIONS.map(([k]) => k);

// Species groups share most advice
const GROUP = { Dog: 'dog', Cat: 'cat', Rabbit: 'small', 'Guinea Pig': 'small', Hamster: 'small', Bird: 'bird', Reptile: 'reptile', Fish: 'fish', 'Farm Animal': 'farm' };
const groupOf = (type) => GROUP[type] || 'small';

const TEMPLATES = {
  dog: {
    before: ['Set up a quiet bed in a low-traffic corner, plus food and water bowls', 'Check fences and gates for gaps; move cables, shoes and toxic plants out of reach',
      'Buy a well-fitting harness, lead and ID tag with your phone number', 'Agree house rules with everyone at home (couch, bedroom, feeding) before day one'],
    days1to3: ['Keep things calm: short walks, no visitors or dog parks yet', 'Take {name} outside to toilet after waking, eating and playing, and praise every success',
      'Let {name} explore one or two rooms first, then widen their space', 'Expect some nerves, pacing or a small appetite — it usually settles in a few days'],
    week1: ['Start a steady daily rhythm for meals, walks and sleep', 'Practise short alone-time sessions (5–20 minutes) and build up slowly',
      'Introduce new people one at a time, outdoors where possible', 'Update the microchip registration to your details'],
    weeks2to4: ['Gradually add new places, sounds and gentle social experiences', 'Join a reward-based training class or puppy/adult manners course',
      'Increase walk length as fitness and confidence grow', 'Book the follow-up vet check if the shelter recommended one'],
    feeding: ['Keep the same food the shelter used for the first week, then switch over 7–10 days if you want to change', 'Feed measured meals at set times rather than leaving food out',
      'Fresh water must always be available', 'Never feed cooked bones, onion, garlic, grapes, chocolate, xylitol or macadamias'],
    exercise: ['Aim for daily walks plus sniffing time — sniffing tires dogs out as much as distance', 'Use puzzle feeders and chew toys to prevent boredom',
      'Avoid hard exercise in the heat of the day; walk early or late in summer'],
    vet: ['Register with a local vet in the first two weeks and bring the shelter paperwork', 'Check when vaccinations, worming and flea/tick treatment are next due',
      'Ask about heartworm prevention and paralysis tick risk in your area'],
    training: ['Use treats and praise — never punishment', 'Practise name, sit, come and settle in 2–3 minute sessions a few times a day',
      'Teach a "go to bed" spot to help them relax at home', 'Keep everyone at home using the same cue words'],
    warning: ['Not eating for more than 24 hours, or repeated vomiting or diarrhoea', 'Laboured breathing, collapse, a swollen belly or pale gums',
      'Wobbliness, weakness or a change in bark (possible tick paralysis)', 'Straining to toilet, blood in urine or stools, or sudden lameness'],
  },
  cat: {
    before: ['Prepare a quiet "base camp" room with a litter tray, food, water, scratching post and hiding spots', 'Cat-proof the home: close gaps behind appliances, secure windows and fly screens',
      'Remove lilies and other toxic plants — lilies are deadly to cats', 'Have a secure carrier ready for the trip home and vet visits'],
    days1to3: ['Keep {name} in the base room and let them come to you', 'Sit quietly nearby, talk softly and offer treats — hiding is normal',
      'Keep the litter tray well away from food and water', 'Keep doors and windows closed; cats can bolt when anxious'],
    week1: ['Once {name} is eating, using the tray and exploring, open up one more room at a time', 'Start short daily play sessions with a wand toy',
      'Keep a predictable routine for meals and play', 'Update the microchip registration to your details'],
    weeks2to4: ['Let {name} explore the rest of the home at their own pace', 'Add vertical spaces like shelves or cat trees and window perches',
      'Consider safe outdoor time only in an enclosed cat run (check your council rules)', 'Book the follow-up vet check if the shelter recommended one'],
    feeding: ['Keep the shelter\'s food at first, then switch gradually over 7–10 days', 'Offer several small meals a day; wet food helps with hydration',
      'Place water away from food — many cats prefer a water fountain', 'Never give onion, garlic, cooked bones, chocolate or cow\'s milk'],
    exercise: ['Two or three 10-minute play sessions a day that end with a "catch" and a treat', 'Rotate toys weekly so they stay interesting',
      'Use puzzle feeders to slow eating and add enrichment'],
    vet: ['Register with a local vet in the first two weeks and bring the shelter paperwork', 'Check when vaccinations, worming and flea treatment are next due',
      'Ask your vet about dental care and keeping a healthy weight'],
    training: ['Reward use of the scratching post with treats and praise', 'Practise calm carrier time at home so vet trips are less stressful',
      'Handle paws and ears gently with treats to make grooming easier'],
    warning: ['Not eating for more than 24 hours', 'Straining in the litter tray with little or no urine (an emergency, especially in male cats)',
      'Open-mouth breathing, hiding with lethargy, or repeated vomiting', 'Sudden weakness in the back legs or a change in meow'],
  },
  small: {
    before: ['Set up a spacious enclosure indoors, away from draughts, direct sun and other pets', 'Add hides, deep bedding, chew items and a heavy food bowl and water bottle',
      'Bunny-proof any free-roam area: cover cables and remove toxic plants', 'Find a vet who sees small mammals (often called an "exotics" vet)'],
    days1to3: ['Give {name} quiet time to settle; sit nearby and talk softly', 'Let them come to you — avoid picking them up until they are relaxed',
      'Keep the same food and bedding the shelter used', 'Check they are eating, drinking and producing normal droppings each day'],
    week1: ['Start short, calm handling sessions low to the ground', 'Offer daily supervised time outside the enclosure in a safe area',
      'Keep a regular daily routine for feeding and cleaning'],
    weeks2to4: ['Add new enrichment: tunnels, dig boxes and foraging toys', 'Gradually extend handling and play time',
      'Book a health check with your vet if the shelter recommended one'],
    feeding: ['Unlimited fresh hay is the main food for rabbits and guinea pigs', 'Add a measured amount of fresh leafy greens and a small amount of pellets',
      'Guinea pigs need vitamin C every day (from greens or a vet-approved supplement)', 'Fresh water every day; introduce any new foods slowly'],
    exercise: ['Daily time to run, hop and explore outside the enclosure', 'Provide things to chew — teeth grow continuously',
      'Keep them cool in hot weather; heat stress is dangerous for small pets'],
    vet: ['Register with an exotics vet and book a first check-up', 'Rabbits in Australia should be vaccinated against calicivirus — ask your vet',
      'Ask about desexing, teeth and nail care'],
    training: ['Use small treats to reward coming to you', 'Rabbits can be litter trained — put hay next to the litter tray',
      'Always support their back and hind legs when lifting'],
    warning: ['Not eating or no droppings for 8–12 hours (an emergency for rabbits and guinea pigs)', 'Hunched posture, teeth grinding or a bloated belly',
      'Runny eyes or nose, head tilt, or diarrhoea', 'Overgrown teeth or drooling'],
  },
  bird: {
    before: ['Set up the largest cage you can, away from the kitchen (cooking fumes can be toxic), draughts and direct sun', 'Add perches of different widths, toys and food and water dishes',
      'Remove non-stick cookware fumes, aerosols and scented candles from the bird\'s area', 'Find an avian vet near you'],
    days1to3: ['Keep {name} in the cage and the room quiet while they settle', 'Talk softly and spend time nearby without forcing contact',
      'Keep the same food the shelter used', 'Cover part of the cage at night for 10–12 hours of sleep'],
    week1: ['Start short training sessions offering a treat through the bars', 'Check doors and windows are closed before any time out of the cage',
      'Keep a daily routine for food, light and quiet time'],
    weeks2to4: ['Begin supervised out-of-cage time in a bird-safe room', 'Rotate toys weekly and add foraging toys',
      'Book a health check with your avian vet'],
    feeding: ['Most pet birds do best on quality pellets plus fresh vegetables, not seed alone', 'Change water daily and clean dishes',
      'Never feed avocado, chocolate, caffeine, alcohol or salty food'],
    exercise: ['Daily out-of-cage time and flapping exercise', 'Foraging toys and safe things to shred', 'Social time with you every day — birds are very social'],
    vet: ['Register with an avian vet and book a first check-up', 'Ask about beak, nail and feather care and a healthy diet'],
    training: ['Use target training and small treats', 'Teach "step up" onto your hand with patience', 'Ignore screaming and reward quiet behaviour'],
    warning: ['Fluffed up and sleepy during the day, or sitting on the cage floor', 'Tail bobbing, open-mouth breathing or discharge from nostrils',
      'Changes in droppings lasting more than a day, or not eating'],
  },
  reptile: {
    before: ['Set up and run the enclosure for several days before {name} arrives, so temperatures are stable', 'Provide a warm basking area, a cool end, UVB lighting (if the species needs it) and hides',
      'Use a thermostat and thermometers at both ends of the enclosure', 'Check your state\'s reptile licence requirements and find a reptile vet'],
    days1to3: ['Leave {name} to settle with minimal handling', 'Keep the room quiet and avoid moving the enclosure',
      'Offer food only once they are settled — skipping a meal or two is normal after a move'],
    week1: ['Start short, calm handling sessions if the species tolerates it', 'Check temperatures and humidity every day',
      'Keep a simple log of feeding, shedding and droppings'],
    weeks2to4: ['Settle into a regular feeding schedule suited to the species', 'Replace UVB globes on the manufacturer\'s schedule',
      'Book a health check with a reptile vet'],
    feeding: ['Feed the diet and food size the shelter recommended for this species', 'Dust insects with calcium (and vitamins as advised)',
      'Provide fresh water in a shallow, clean dish'],
    exercise: ['Give enough space to move, climb or burrow as the species needs', 'Add branches, rocks and hides for enrichment'],
    vet: ['Find a vet experienced with reptiles and book a check-up', 'Ask about parasite checks and correct lighting and heating'],
    training: ['Handle low and close to the ground, supporting the whole body', 'Wash hands before and after handling (reptiles can carry salmonella)'],
    warning: ['Not eating for longer than is normal for the species', 'Stuck shed, swollen joints, or a soft or misshapen jaw',
      'Mouth open breathing, bubbles from the nose, or lethargy at basking temperature'],
  },
  fish: {
    before: ['Set up and cycle the aquarium for several weeks before adding fish', 'Use a heater (for tropical fish), filter, thermometer and water conditioner',
      'Test the water for ammonia, nitrite and nitrate'],
    days1to3: ['Float the bag to match temperature, then add tank water slowly before releasing {name}', 'Keep lights dim on the first day',
      'Feed lightly — it is easy to overfeed'],
    week1: ['Test water every couple of days', 'Watch for normal swimming and appetite', 'Do a small partial water change at the end of the week'],
    weeks2to4: ['Settle into weekly partial water changes (about 20–25%)', 'Add any new tank mates slowly and only if compatible',
      'Clean the filter in tank water, never tap water'],
    feeding: ['Feed small amounts once or twice a day — only what is eaten in two minutes', 'Use food suited to the species and vary it with frozen or live foods if advised'],
    exercise: ['Provide plants, hiding spots and swimming space', 'Keep a regular day–night light cycle'],
    vet: ['Some vets treat fish — find one, or an experienced aquarium store, for advice', 'Ask about quarantine for any new fish'],
    training: ['Keep a simple log of water tests and changes', 'Keep the tank away from direct sun and heaters'],
    warning: ['Gasping at the surface, clamped fins or lying on the bottom', 'White spots, fuzzy patches or torn fins', 'Not eating for more than a couple of days'],
  },
  farm: {
    before: ['Check your council and state rules for keeping livestock and get a Property Identification Code (PIC) if needed', 'Prepare secure fencing, shelter from sun and rain, and clean water',
      'Have hay and the feed the shelter recommended ready', 'Find a large-animal vet in your area'],
    days1to3: ['Let {name} settle in a smaller, secure paddock or yard', 'Keep visitors and handling calm and minimal',
      'Check they are eating, drinking and moving comfortably'],
    week1: ['Start a regular daily routine for feeding and checks', 'Introduce any herd companions gradually over a fence first',
      'Check fences daily'],
    weeks2to4: ['Gradually expand grazing areas and watch for toxic plants', 'Book a vet visit for a health check',
      'Plan hoof trimming, shearing or grooming as needed'],
    feeding: ['Change diets slowly to avoid bloat and digestive upsets', 'Provide good-quality hay or pasture and clean water at all times',
      'Never feed lawn clippings or garden waste'],
    exercise: ['Plenty of space to graze and move', 'Most farm animals are herd animals and need company of their own kind'],
    vet: ['Register with a large-animal vet and ask about vaccinations and drenching', 'Ask about hoof care and parasite control'],
    training: ['Use calm, patient handling and food rewards', 'Practise leading on a halter in short sessions'],
    warning: ['Bloated left side, not chewing cud, or lying down and unable to get up', 'Lameness, diarrhoea or not eating', 'Separating from the herd or unusual lethargy'],
  },
};

const fill = (s, pet) => s.replace(/\{name\}/g, pet.name || 'your new pet');

// Personalised additions from the adopter's own lifestyle answers
function lifestyleNotes(pet, life) {
  const g = groupOf(pet.type);
  const add = {};
  const push = (k, s) => { (add[k] = add[k] || []).push(s); };
  if (life.hasChildren === true) push('before', `Talk with the children about giving ${pet.name} space, gentle handling and never disturbing them while eating or sleeping`);
  if (life.hasOtherPets === true) push('week1', `Introduce ${pet.name} to your other pets slowly — separate spaces first, then short supervised meetings`);
  if (life.experience === 'First-time owner') push('training', 'As a first-time owner, ask the shelter or a qualified trainer for help early — small questions are welcome');
  if (/apartment/i.test(life.livingType || '') && g === 'dog') push('exercise', 'In an apartment, plan extra walks and toilet breaks, and check your building\'s rules');
  if (/without yard|apartment/i.test(life.livingType || '') && pet.requiresYard) push('before', 'The shelter noted a secure yard — plan regular visits to a fenced area');
  if (Number(life.hoursAlone) >= 8 && g === 'dog') push('week1', 'For long workdays, line up a dog walker, doggy daycare or a midday visit before you return to work');
  if (Number(life.hoursAlone) >= 8 && g === 'cat') push('exercise', 'Leave puzzle feeders and window perches for long days alone');
  if (Number(life.energyLevel || pet.energyLevel) === 3 && g === 'dog') push('exercise', `${pet.name} has high energy — add games like fetch, scent work or training to daily walks`);
  return add;
}

function rulesPlan(pet, life = {}) {
  const t = TEMPLATES[groupOf(pet.type)];
  const extra = lifestyleNotes(pet, life);
  const sections = SECTIONS.map(([key, title]) => ({ key, title, items: [...(t[key] || []).map((s) => fill(s, pet)), ...(extra[key] || [])].slice(0, 7) }));
  return { intro: `A simple plan for ${pet.name}'s first month with you. Every pet settles at their own pace — go slowly and ask the shelter if anything worries you.`, sections };
}

// Only the lifestyle answers needed for care advice — never names, contact details, address or staff notes
const lifestyleFrom = (app) => ({ livingType: app.livingType || '', hoursAlone: app.hoursAlone === '' ? null : app.hoursAlone, workSchedule: String(app.workSchedule || '').slice(0, 200),
  experience: app.experience || '', hasChildren: app.hasChildren === '' ? null : Boolean(app.hasChildren), childrenAges: String(app.childrenAges || '').slice(0, 60),
  hasOtherPets: app.hasOtherPets === '' ? null : Boolean(app.hasOtherPets), otherPets: String(app.otherPetsDetails || '').slice(0, 200), activityLevel: app.activityLevel || null });

const petFacts = (p) => ({ name: p.name, type: p.type, breed: p.breed, ageYears: p.age, size: p.size, gender: p.gender, energyLevel: p.energyLevel,
  goodWithChildren: p.goodWithChildren, goodWithOtherPets: p.goodWithOtherPets, needsYard: p.requiresYard, traits: p.traits, idealHome: p.idealHome || undefined });

async function generateCarePlan(pet, app) {
  const life = lifestyleFrom(app);
  const fallback = rulesPlan(pet, life);
  const base = { petType: pet.type, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER };
  if (!llm.llmEnabled) return { ...fallback, ...base, source: 'rules' };
  try {
    const raw = await llm.complete({ json: true, maxTokens: 2200,
      system: `You write a practical "first 30 days" care plan for someone who has just been approved to adopt a rescue pet in Australia.
Use the pet's facts and the adopter's lifestyle to personalise it. Australian English, warm, specific and practical.
Do not diagnose, prescribe medicines or give doses, and do not invent medical facts about this pet. Suggest seeing a vet for anything medical.
Each item is one short sentence (max 25 words). 3–6 items per section.
Return {"intro": string (max 40 words), "sections": {${KEYS.map((k) => `"${k}": string[]`).join(', ')}}}.
Sections: before = before they come home; days1to3; week1; weeks2to4; feeding; exercise; vet = vet and vaccinations; training; warning = warning signs that need a vet.`,
      messages: [{ role: 'user', content: JSON.stringify({ pet: petFacts(pet), adopterLifestyle: life }) }] });
    const s = raw && typeof raw.sections === 'object' ? raw.sections : {};
    const ok = KEYS.every((k) => Array.isArray(s[k]) && s[k].length >= 2 && s[k].every((x) => typeof x === 'string' && x.trim().length >= 8 && x.length <= 300));
    if (!ok) return { ...fallback, ...base, source: 'rules' };
    const intro = typeof raw.intro === 'string' && raw.intro.trim().length >= 10 ? raw.intro.trim().slice(0, 400) : fallback.intro;
    return { intro, sections: SECTIONS.map(([key, title]) => ({ key, title, items: s[key].slice(0, 7).map((x) => x.trim()) })), ...base, source: llm.provider };
  } catch (err) {
    if (!err.quiet) console.warn('AI care plan fallback:', err.message.split('\n')[0].slice(0, 160));
    return { ...fallback, ...base, source: 'rules' };
  }
}

module.exports = { generateCarePlan, rulesPlan, lifestyleFrom, SECTIONS, DISCLAIMER, groupOf };
