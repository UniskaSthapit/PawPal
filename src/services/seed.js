// Demo data so a fresh PawPal install has something to explore. Only runs when the database is empty
// (or when an administrator resets demo data). All people, pets and stories here are fictional demo content.
const bcrypt = require('bcryptjs');
const db = require('../db');
const { newId, now } = require('../utils');
const { calculateSuitabilityScore } = require('./scoring');
const { templateDescription } = require('./ai');
const { DEFAULT_SHELTERS, SCHEMA_VERSION, shelterFor, addExtraPets } = require('./migrate');
const { parseProfile } = require('./matching');

const img = (id, w = 1000, h = 800) => `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;
const daysAgo = (d, hour = 10) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(hour, (Math.abs(d) * 7) % 60, 0, 0); return t.toISOString(); };

const PETS = [
  { name: 'Biscuit', type: 'Dog', breed: 'Golden Retriever', age: 3, gender: 'Male', size: 'Large', colour: 'Golden', location: 'Footscray, VIC', adoptionFee: 450,
    traits: ['Good with Kids', 'Playful', 'Loyal'], energyLevel: 3, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'An active family with a secure yard who love weekend adventures.',
    photos: [img('photo-1591160690555-5debfba289f0'), img('photo-1633722715463-d30f4f325e24')] },
  { name: 'Luna', type: 'Dog', breed: 'Border Collie', age: 2, gender: 'Female', size: 'Medium', colour: 'Black & white', location: 'Parramatta, NSW', adoptionFee: 420,
    traits: ['Active', 'Smart', 'Eager to Learn'], energyLevel: 3, requiresYard: true, goodWithChildren: true, goodWithOtherPets: false,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'An experienced owner who enjoys training, running or dog sports.',
    photos: [img('photo-1503256207526-0d5d80fa2f47')] },
  { name: 'Max', type: 'Dog', breed: 'French Bulldog', age: 1, gender: 'Male', size: 'Small', colour: 'Fawn', location: 'Osborne Park, WA', adoptionFee: 550,
    traits: ['Apartment Friendly', 'Playful', 'Cuddly'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: true, desexed: false, microchipped: true, idealHome: 'Apartment or house — as long as there is a lap to sit on.',
    photos: [img('photo-1561754050-9a1ee0470c73')] },
  { name: 'Rosie', type: 'Dog', breed: 'Beagle', age: 4, gender: 'Female', size: 'Medium', colour: 'Tricolour', location: 'Woolloongabba, QLD', adoptionFee: 380,
    traits: ['Good with Kids', 'Gentle', 'Curious'], energyLevel: 2, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'A family home with a well-fenced yard (she follows her nose!).',
    photos: [img('photo-1631048905843-88f82fba8fd4')] },
  { name: 'Mochi', type: 'Cat', breed: 'Siamese Mix', age: 2, gender: 'Female', size: 'Small', colour: 'Seal point', location: 'Woolloongabba, QLD', adoptionFee: 180,
    traits: ['Apartment Friendly', 'Calm', 'Chatty'], energyLevel: 1, requiresYard: false, goodWithChildren: false, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'A calm adult household where she can chat to you all evening.',
    photos: [img('photo-1577696393108-d99e9f054fff')] },
  { name: 'Leo', type: 'Cat', breed: 'Maine Coon', age: 5, gender: 'Male', size: 'Large', colour: 'Brown tabby', location: 'Woolloongabba, QLD', adoptionFee: 200,
    traits: ['Gentle', 'Playful', 'Fluffy'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'Any loving home with room for a very large, very gentle cat.',
    photos: [img('photo-1574158622682-e40e69881006')] },
  { name: 'Nala', type: 'Cat', breed: 'Tabby', age: 1, gender: 'Female', size: 'Small', colour: 'Grey tabby', location: 'Woolloongabba, QLD', adoptionFee: 180,
    traits: ['Active', 'Curious', 'Playful'], energyLevel: 3, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false,
    vaccinated: false, desexed: false, microchipped: true, idealHome: 'An only-cat home with lots of toys and climbing spots.',
    photos: [img('photo-1478098711619-5ab0b478d6e6')] },
  { name: 'Coco', type: 'Rabbit', breed: 'Holland Lop', age: 2, gender: 'Female', size: 'Small', colour: 'Brown & white', location: 'Parramatta, NSW', adoptionFee: 90,
    traits: ['Apartment Friendly', 'Gentle', 'Quiet'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: true, desexed: true, microchipped: false, idealHome: 'A quiet indoor home with space to hop and a gentle routine.',
    photos: [img('photo-1452857297128-d9c29adba80b')] },
  { name: 'Charlie', type: 'Dog', breed: 'Pembroke Welsh Corgi', age: 1, gender: 'Male', size: 'Small', colour: 'Red & white', location: 'Parramatta, NSW', adoptionFee: 520,
    traits: ['Smart', 'Loyal', 'Playful'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: true, desexed: false, microchipped: true, idealHome: 'A home with daily walks and someone to show off his tricks to.',
    photos: [img('photo-1600077106724-946750eeaf3c')] },
  { name: 'Bella', type: 'Dog', breed: 'Golden Retriever Mix', age: 2, gender: 'Female', size: 'Large', colour: 'Cream', location: 'Footscray, VIC', adoptionFee: 450,
    traits: ['Gentle', 'Good with Kids', 'Affectionate'], energyLevel: 2, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'A family home with a yard and people around most of the day.',
    photos: [img('photo-1602241628512-459cdd3234fe'), img('photo-1558788353-f76d92427f16')] },
  { name: 'Pepper', type: 'Dog', breed: 'Kelpie Cross', age: 3, gender: 'Female', size: 'Medium', colour: 'Red', location: 'Footscray, VIC', adoptionFee: 400,
    traits: ['Active', 'Smart', 'Outdoorsy'], energyLevel: 3, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'A runner, hiker or rural property — Pepper needs a job to do.',
    photos: [img('photo-1561037404-61cd46aa615b'), img('photo-1552053831-71594a27632d')] },
  { name: 'Oliver', type: 'Cat', breed: 'Domestic Shorthair', age: 9, gender: 'Male', size: 'Medium', colour: 'Orange', location: 'Footscray, VIC', adoptionFee: 50,
    traits: ['Calm', 'Cuddly', 'Senior'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'A quiet home with a sunny windowsill. Perfect for retirees.',
    photos: [img('photo-1698170928357-a4671f4ef461')] },
  { name: 'Snowy', type: 'Rabbit', breed: 'Netherland Dwarf', age: 1, gender: 'Male', size: 'Small', colour: 'White', location: 'Footscray, VIC', adoptionFee: 90,
    traits: ['Curious', 'Gentle'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false,
    vaccinated: true, desexed: false, microchipped: false, idealHome: 'An indoor home with a rabbit-proofed room to explore.',
    photos: [img('photo-1585110396000-c9ffd4e4b308')] },
  { name: 'Archie', type: 'Dog', breed: 'Mixed Breed', age: 0, gender: 'Male', size: 'Medium', colour: 'Tan', location: 'Footscray, VIC', adoptionFee: 500,
    traits: ['Playful', 'Curious', 'Social'], energyLevel: 3, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'Puppy-experienced owners who can commit to training classes.',
    photos: [img('photo-1587300003388-59208cc962cb')] },
  { name: 'Tilly', type: 'Cat', breed: 'Domestic Shorthair', age: 3, gender: 'Female', size: 'Small', colour: 'Tabby', location: 'Parramatta, NSW', adoptionFee: 150,
    traits: ['Affectionate', 'Independent', 'Apartment Friendly'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'A working household — she is happy on her own during the day.',
    photos: [img('photo-1514888286974-6c03e2ca1dba')] },
  { name: 'Ruby', type: 'Dog', breed: 'Mixed Breed', age: 6, gender: 'Female', size: 'Medium', colour: 'Brown & white', location: 'Woolloongabba, QLD', adoptionFee: 250,
    traits: ['Calm', 'Gentle', 'Friendly'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'An easy-going companion for an apartment or quiet house.',
    photos: [img('photo-1543466835-00a7907e9de1')] },
  { name: 'Juno', type: 'Dog', breed: 'Mixed Breed', age: 4, gender: 'Female', size: 'Medium', colour: 'Brindle', location: 'Osborne Park, WA', adoptionFee: 320,
    traits: ['Loyal', 'Gentle', 'Affectionate'], energyLevel: 2, requiresYard: false, goodWithChildren: false, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, idealHome: 'An adult household with a relaxed routine.',
    photos: [img('photo-1450778869180-41d0601e046e')] },
  { name: 'Peanut', type: 'Hamster', breed: 'Syrian Hamster', age: 0, gender: 'Male', size: 'Small', colour: 'Golden', location: 'Osborne Park, WA', adoptionFee: 25,
    traits: ['Curious', 'Quiet', 'Apartment Friendly'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: false, desexed: false, microchipped: false, idealHome: 'A calm indoor home with a large enclosure and gentle handling.',
    photos: [img('photo-1425082661705-1834bfd09dca')] },
];

const MEDICAL = ['Up to date on vaccinations. Healthy weight. No known conditions.', 'Recovered from a minor skin infection in March. Monitor coat condition.',
  'Mild seasonal allergies — responds well to diet change.', 'Dental clean completed. No ongoing medication.'];
const RESCUE = ['Surrendered by previous owner due to relocation.', 'Found as a stray and brought in by council rangers.',
  'Transferred from a partner rural shelter.', 'Rehomed after owner moved into aged care.'];

// [name, livingType, activity, kids, otherPets, experience, hoursAlone, petIndex, finalStatus, daysAgo, ownership]
const APPLICANTS = [
  ['Sarah Johnson', 'House with yard', 3, true, false, 'Experienced', 4, 0, 'Adopted', 26, 'Own'],
  ['Michael Chen', 'Apartment', 1, false, true, 'Some experience', 6, 4, 'Meet & Greet', 9, 'Rent'],
  ['Emily Rodriguez', 'Apartment', 2, true, false, 'First-time owner', 5, 2, 'Submitted', 1, 'Rent'],
  ['David Park', 'House without yard', 2, false, false, 'Experienced', 3, 5, 'Under Review', 5, 'Own'],
  ['Jessica Williams', 'House with yard', 2, true, true, 'Some experience', 4, 3, 'Approved', 14, 'Own'],
  ['Liam Nguyen', 'Farm / acreage', 3, true, true, 'Experienced', 2, 10, 'Interview', 6, 'Own'],
  ['Olivia Brown', 'Apartment', 1, false, false, 'Some experience', 8, 11, 'Info Requested', 4, 'Rent'],
  ['Noah Wilson', 'Apartment', 3, false, false, 'First-time owner', 9, 1, 'Declined', 20, 'Rent'],
  ['Ava Taylor', 'House with yard', 2, true, false, 'Experienced', 4, 9, 'Adoption Scheduled', 16, 'Own'],
  ['Ethan Martin', 'House without yard', 1, false, true, 'Some experience', 5, 15, 'Submitted', 0, 'Live with family'],
  ['Grace Lee', 'Apartment', 2, false, false, 'First-time owner', 7, 14, 'Under Review', 3, 'Rent'],
];
const FLOW = ['Submitted', 'Under Review', 'Interview', 'Meet & Greet', 'Approved', 'Adoption Scheduled', 'Adopted'];
const KEYWORDS = ['golden retriever', 'puppy', 'cat', 'apartment', 'small dog', 'kitten', 'good with kids', 'rabbit', 'beagle', 'calm', 'border collie', 'senior cat', 'hypoallergenic', 'poodle'];

async function seedIfEmpty({ force = false } = {}) {
  if (!force && (await db.count('users')) > 0) return false;
  for (const c of ['users', 'pets', 'applications', 'searches', 'events', 'notifications', 'emails', 'shelters', 'favourites', 'enquiries',
    'conversations', 'matches', 'phoneCodes', 'sms', 'images', 'messages', 'meta']) await db.clear(c);

  const shelters = [];
  for (const { key, ...s } of DEFAULT_SHELTERS) {
    const shelter = { id: newId('shelter'), ...s, createdAt: daysAgo(200) };
    shelters.push(shelter);
    await db.insert('shelters', shelter);
  }
  const melb = shelters[0];

  const [adminHash, staffHash, userHash] = await Promise.all([bcrypt.hash('Admin@123', 10), bcrypt.hash('Staff@123', 10), bcrypt.hash('User@123', 10)]);
  const admin = { id: newId('user'), name: 'Alex Morgan', email: 'admin@pawpal.com', passwordHash: adminHash, role: 'admin', shelterId: null,
    emailVerified: true, tokenVersion: 0, active: true, createdAt: daysAgo(180) };
  const staff = { id: newId('user'), name: 'Priya Shah', email: 'staff@pawpal.com', passwordHash: staffHash, role: 'staff', shelterId: melb.id,
    emailVerified: true, tokenVersion: 0, active: true, createdAt: daysAgo(150) };
  const demoText = 'I live in a house with a small yard in Melbourne, work from home three days a week and have some experience with dogs. Looking for a friendly, moderately active dog.';
  const demo = { id: newId('user'), name: 'Jordan Taylor', email: 'user@pawpal.com', passwordHash: userHash, role: 'user',
    emailVerified: true, tokenVersion: 0, active: true, phone: '+61400123456', phoneVerified: false, createdAt: daysAgo(30),
    preferences: parseProfile(demoText, {}, ['Footscray, VIC']), preferencesText: demoText, preferencesAt: daysAgo(3) };
  for (const u of [admin, staff, demo]) await db.insert('users', u);

  const pets = PETS.map((p, i) => ({ id: newId('pet'), ...p, status: 'Available', description: templateDescription(p),
    shelterId: shelterFor(p.location, shelters).id, medicalHistory: MEDICAL[i % MEDICAL.length], rescueBackground: RESCUE[i % RESCUE.length],
    internalNotes: i % 3 === 0 ? 'Reactive to loud trucks on walks — mention at meet & greet.' : '',
    createdBy: admin.id, createdAt: daysAgo(70 - i * 3), updatedAt: daysAgo(70 - i * 3) }));
  pets[6].status = 'Draft';

  for (const [i, a] of APPLICANTS.entries()) {
    const [name, livingType, activityLevel, hasChildren, hasOtherPets, experience, hoursAlone, petIndex, status, ago, ownership] = a;
    const pet = pets[petIndex];
    const isDemo = i === 2 || i === 3;
    const applicant = isDemo ? demo.name : name;
    const email = isDemo ? demo.email : `${name.split(' ')[0].toLowerCase()}@example.com`;
    const form = { livingType, activityLevel, hasChildren, hasOtherPets, experience, hoursAlone };
    const s = calculateSuitabilityScore(form, pet);
    let steps = status === 'Declined' ? ['Submitted', 'Under Review', 'Declined'] : status === 'Info Requested' ? ['Submitted', 'Under Review', 'Info Requested'] : FLOW.slice(0, FLOW.indexOf(status) + 1);
    if (!steps.length) steps = ['Submitted'];
    const history = steps.map((st, k) => ({ status: st, at: daysAgo(Math.max(0, ago - k * 2), 9 + k), by: k ? staff.name : 'Applicant',
      ...(st === 'Info Requested' ? { note: 'Could you confirm your landlord is happy for you to have a cat? A copy of the approval is perfect.' } : {}),
      ...(st === 'Declined' ? { note: 'Luna needs a very experienced home with no long days alone. We\'d love to help you find a better match.' } : {}) }));
    const needsDate = ['Interview', 'Meet & Greet', 'Adoption Scheduled'].includes(status);
    const messages = history.filter((h) => h.note).map((h) => ({ id: newId('msg'), from: 'staff', name: staff.name, text: h.note, at: h.at }));
    await db.insert('applications', {
      id: newId('app'), petId: pet.id, petName: pet.name, petBreed: pet.breed, petPhoto: pet.photos[0], shelterId: pet.shelterId,
      userId: isDemo ? demo.id : null, name: applicant, email, phone: isDemo ? demo.phone : '04' + String(10000000 + i * 7654321).slice(0, 8),
      address: isDemo ? '12 Wattle Street, Footscray VIC 3011' : i % 3 === 0 ? '' : 'Melbourne VIC', ownership, landlordPermission: ownership === 'Rent' ? i % 2 === 0 : '',
      householdAdults: 1 + (i % 3), workSchedule: i % 4 === 0 ? '' : 'Office three days a week, home two days.',
      ...form, experienceDetails: i % 3 === 1 ? '' : 'Grew up with dogs and cats; looked after a neighbour\'s dog for a year.',
      motivation: `We have been hoping to adopt for a while and ${pet.name}'s profile felt like a perfect fit for our routine.`, declaration: true,
      score: s.score, label: s.label, breakdown: s.breakdown, notes: s.notes, status, history, messages, staffNotes: '',
      appointmentAt: needsDate ? daysAgo(-(2 + (i % 4)), 11) : null,
      submittedAt: daysAgo(ago, 9), updatedAt: history[history.length - 1].at,
    });
    if (status === 'Adopted') { pet.status = 'Adopted'; pet.adoptedAt = history[history.length - 1].at; }
    else if (['Approved', 'Meet & Greet', 'Adoption Scheduled'].includes(status) && pet.status === 'Available') pet.status = 'On Hold';
  }
  for (const pet of pets) await db.insert('pets', pet);
  // Reptiles, birds, fish, hamsters, goats and cows (see extra-pets.js)
  await addExtraPets(shelters, { createdBy: admin.id });

  // Enquiries and favourites
  const enquiries = [[2, 'Is Max okay being left alone for a few hours while I\'m at work?', 'Answered', 'He copes well with 4–5 hours once settled. We recommend a slow start with short absences.'],
    [9, 'Does Bella travel well in the car? We visit family most weekends.', 'Open', ''], [13, 'How much training has Archie had so far?', 'Open', ''],
    [15, 'Would Ruby be okay with a quiet older cat?', 'Answered', 'Ruby lived with a cat in her previous foster home and ignored him completely.'], [10, 'Can Pepper come on long hikes?', 'Open', '']];
  for (const [k, [petIndex, message, status, reply]] of enquiries.entries()) {
    const pet = pets[petIndex];
    const mine = k < 2;
    await db.insert('enquiries', { id: newId('enq'), petId: pet.id, petName: pet.name, shelterId: pet.shelterId, userId: mine ? demo.id : null,
      name: mine ? demo.name : ['Chris Allen', 'Mia Lopez', 'Tom Baker'][k - 2], email: mine ? demo.email : `enquirer${k}@example.com`, message, status, reply,
      repliedBy: reply ? staff.name : undefined, at: daysAgo(6 - k, 13), repliedAt: reply ? daysAgo(5 - k, 15) : null });
  }
  for (const petIndex of [9, 15, 8]) await db.insert('favourites', { id: newId('fav'), userId: demo.id, petId: pets[petIndex].id, at: daysAgo(4) });

  // Eight weeks of searches, visits and profile views so analytics has history
  const publicPets = pets.filter((p) => ['Available', 'On Hold'].includes(p.status));
  for (let d = 56; d >= 0; d--) {
    for (let k = 0; k < 2 + ((d * 7) % 5); k++) {
      const keyword = KEYWORDS[(d * 3 + k * 5) % KEYWORDS.length];
      await db.insert('searches', { id: newId('srch'), keyword, results: ['hypoallergenic', 'poodle'].includes(keyword) ? 0 : 1 + ((d + k) % 4), at: daysAgo(d, 8 + k) });
    }
    for (let k = 0; k < 8 + ((d * 5) % 9); k++) await db.insert('events', { id: newId('evt'), type: 'visit', at: daysAgo(d, 7 + (k % 12)) });
    for (let k = 0; k < 3 + ((d * 3) % 6); k++) {
      const pet = publicPets[(d * 5 + k * 3) % publicPets.length];
      if (new Date(pet.createdAt) <= new Date(daysAgo(d))) await db.insert('events', { id: newId('evt'), type: 'pet_view', petId: pet.id, shelterId: pet.shelterId, at: daysAgo(d, 9 + (k % 10)) });
    }
    for (let k = 0; k < 1 + ((d * 3) % 4); k++) await db.insert('events', { id: newId('evt'), type: 'ai_match', at: daysAgo(d, 12 + (k % 6)) });
  }

  await db.insert('notifications', { id: newId('note'), userId: demo.id, type: 'account', title: 'Welcome to PawPal',
    message: 'Tell PawPal about your lifestyle to see pets that could suit you.', link: 'ai-matching.html', read: true, at: daysAgo(30) });
  await db.insert('meta', { id: 'schema', version: SCHEMA_VERSION, at: now() });
  await db.flush();
  return true;
}

module.exports = { seedIfEmpty };
