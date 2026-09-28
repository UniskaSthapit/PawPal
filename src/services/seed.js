// Sample data so PawPal looks alive on first run (only runs when the database is empty).
const bcrypt = require('bcryptjs');
const db = require('../db');
const { newId } = require('../utils');
const { calculateSuitabilityScore } = require('./scoring');
const { templateDescription } = require('./ai');

const img = (id, w = 900, h = 700) => `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;
const daysAgo = (d, hour = 10) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(hour, (d * 7) % 60, 0, 0); return t.toISOString(); };

const PETS = [
  { name: 'Biscuit', type: 'Dog', breed: 'Golden Retriever', age: 3, gender: 'Male', size: 'Large', location: 'Grandville, NSW',
    traits: ['Good with Kids', 'Playful', 'Loyal'], energyLevel: 3, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, photos: [img('photo-1591160690555-5debfba289f0'), img('photo-1587300003388-59208cc962cb'), img('photo-1633722715463-d30f4f325e24')] },
  { name: 'Luna', type: 'Dog', breed: 'Border Collie', age: 2, gender: 'Female', size: 'Medium', location: 'Hurstville, NSW',
    traits: ['Active', 'Smart', 'Eager to Learn'], energyLevel: 3, requiresYard: true, goodWithChildren: true, goodWithOtherPets: false,
    vaccinated: true, desexed: true, microchipped: true, photos: [img('photo-1503256207526-0d5d80fa2f47')] },
  { name: 'Max', type: 'Dog', breed: 'French Bulldog', age: 1, gender: 'Male', size: 'Small', location: 'Perth, WA',
    traits: ['Apartment Friendly', 'Playful', 'Cuddly'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: false, microchipped: true, photos: [img('photo-1561754050-9a1ee0470c73')] },
  { name: 'Rosie', type: 'Dog', breed: 'Beagle', age: 4, gender: 'Female', size: 'Medium', location: 'Browland, QLD',
    traits: ['Good with Kids', 'Gentle', 'Curious'], energyLevel: 2, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, photos: [img('photo-1631048905843-88f82fba8fd4'), img('photo-1543466835-00a7907e9de1')] },
  { name: 'Mochi', type: 'Cat', breed: 'Siamese Mix', age: 2, gender: 'Female', size: 'Small', location: 'Brisbane, QLD',
    traits: ['Apartment Friendly', 'Calm', 'Chatty'], energyLevel: 1, requiresYard: false, goodWithChildren: false, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, photos: [img('photo-1577696393108-d99e9f054fff')] },
  { name: 'Leo', type: 'Cat', breed: 'Maine Coon', age: 5, gender: 'Male', size: 'Large', location: 'Gold Coast, QLD',
    traits: ['Gentle', 'Playful', 'Fluffy'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, photos: [img('photo-1574158622682-e40e69881006')] },
  { name: 'Nala', type: 'Cat', breed: 'Tabby', age: 1, gender: 'Female', size: 'Small', location: 'Brisbane, QLD',
    traits: ['Active', 'Curious', 'Playful'], energyLevel: 3, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false,
    vaccinated: false, desexed: false, microchipped: true, photos: [img('photo-1478098711619-5ab0b478d6e6'), img('photo-1514888286974-6c03e2ca1dba')] },
  { name: 'Coco', type: 'Rabbit', breed: 'Holland Lop', age: 2, gender: 'Female', size: 'Small', location: 'Tempe, NSW',
    traits: ['Apartment Friendly', 'Gentle', 'Quiet'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false,
    vaccinated: true, desexed: true, microchipped: false, photos: [img('photo-1452857297128-d9c29adba80b')] },
  { name: 'Charlie', type: 'Dog', breed: 'Pembroke Welsh Corgi', age: 1, gender: 'Male', size: 'Small', location: 'Parramatta, NSW',
    traits: ['Smart', 'Loyal', 'Playful'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: false, microchipped: true, photos: [img('photo-1600077106724-946750eeaf3c')] },
  { name: 'Bella', type: 'Dog', breed: 'Golden Retriever Mix', age: 2, gender: 'Female', size: 'Large', location: 'Footscray, VIC',
    traits: ['Gentle', 'Good with Kids', 'Affectionate'], energyLevel: 2, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, photos: [img('photo-1602241628512-459cdd3234fe'), img('photo-1558788353-f76d92427f16')] },
  { name: 'Pepper', type: 'Dog', breed: 'Kelpie Cross', age: 3, gender: 'Female', size: 'Medium', location: 'Ballarat, VIC',
    traits: ['Active', 'Smart', 'Outdoorsy'], energyLevel: 3, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, photos: [img('photo-1561037404-61cd46aa615b'), img('photo-1552053831-71594a27632d')] },
  { name: 'Oliver', type: 'Cat', breed: 'Domestic Shorthair', age: 7, gender: 'Male', size: 'Medium', location: 'Richmond, VIC',
    traits: ['Calm', 'Cuddly', 'Senior'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, photos: [img('photo-1698170928357-a4671f4ef461')] },
  { name: 'Snowy', type: 'Rabbit', breed: 'Netherland Dwarf', age: 1, gender: 'Male', size: 'Small', location: 'Carlton, VIC',
    traits: ['Curious', 'Gentle'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false,
    vaccinated: true, desexed: false, microchipped: false, photos: [img('photo-1585110396000-c9ffd4e4b308')] },
];

const MEDICAL = ['Up to date on vaccinations. Healthy weight. No known conditions.', 'Recovered from a minor skin infection in March. Monitor coat condition.',
  'Mild seasonal allergies — responds well to diet change.', 'Dental clean completed. No ongoing medication.'];
const RESCUE = ['Surrendered by previous owner due to relocation.', 'Found as a stray and brought in by council rangers.',
  'Transferred from a partner rural shelter.', 'Rehomed after owner moved into aged care.'];

const APPLICANTS = [
  ['Sarah Johnson', 'House with yard', 3, true, false, 'Experienced', 4, 0, 'Adopted', 18],
  ['Michael Chen', 'Apartment', 1, false, true, 'Some experience', 6, 4, 'Visit Scheduled', 9],
  ['Emily Rodriguez', 'Apartment', 2, true, false, 'First-time owner', 5, 2, 'Pending', 1],
  ['David Park', 'House without yard', 2, false, false, 'Experienced', 3, 5, 'Shortlisted', 5],
  ['Jessica Williams', 'House with yard', 2, true, true, 'Some experience', 4, 3, 'Approved', 14],
  ['Liam Nguyen', 'Farm / acreage', 3, true, true, 'Experienced', 2, 10, 'Pending', 3],
  ['Olivia Brown', 'Apartment', 1, false, false, 'Some experience', 8, 11, 'Pending', 2],
  ['Noah Wilson', 'Apartment', 3, false, false, 'First-time owner', 9, 1, 'Rejected', 20],
  ['Ava Taylor', 'House with yard', 2, true, false, 'Experienced', 4, 9, 'Shortlisted', 6],
  ['Ethan Martin', 'House without yard', 1, false, true, 'Some experience', 5, 7, 'Pending', 0],
];
const FLOW = ['Pending', 'Shortlisted', 'Visit Scheduled', 'Approved', 'Adopted'];

const KEYWORDS = ['golden retriever', 'puppy', 'cat', 'apartment', 'small dog', 'kitten', 'good with kids', 'rabbit', 'beagle', 'calm', 'border collie', 'senior cat', 'hypoallergenic'];

async function seedIfEmpty({ force = false } = {}) {
  if (!force && (await db.count('users')) > 0) return false;
  for (const c of ['users', 'pets', 'applications', 'searches', 'events', 'notifications', 'emails']) await db.clear(c);

  const staffHash = await bcrypt.hash('Admin@123', 10);
  const userHash = await bcrypt.hash('User@123', 10);
  const admin = { id: newId('user'), name: 'Admin', email: 'admin@pawpal.com', passwordHash: staffHash, role: 'staff',
    emailVerified: true, tokenVersion: 0, active: true, createdAt: daysAgo(120) };
  const demo = { id: newId('user'), name: 'Demo Adopter', email: 'user@pawpal.com', passwordHash: userHash, role: 'user',
    emailVerified: true, tokenVersion: 0, active: true, phone: '0400 123 456', createdAt: daysAgo(30) };
  await db.insert('users', admin);
  await db.insert('users', demo);

  const pets = [];
  for (const [i, p] of PETS.entries()) {
    const pet = { id: newId('pet'), ...p, status: 'Available', description: templateDescription(p),
      medicalHistory: MEDICAL[i % MEDICAL.length], rescueBackground: RESCUE[i % RESCUE.length],
      createdBy: admin.id, createdAt: daysAgo(60 - i * 3), updatedAt: daysAgo(60 - i * 3) };
    pets.push(pet);
  }

  for (const [i, a] of APPLICANTS.entries()) {
    const [name, livingType, activityLevel, hasChildren, hasOtherPets, experience, hoursAlone, petIndex, status, ago] = a;
    const pet = pets[petIndex];
    const isDemo = i === 2 || i === 3; // two applications belong to the demo adopter account
    const applicant = isDemo ? demo.name : name;
    const email = isDemo ? demo.email : `${name.split(' ')[0].toLowerCase()}@example.com`;
    const form = { livingType, activityLevel, hasChildren, hasOtherPets, experience, hoursAlone };
    const s = calculateSuitabilityScore(form, pet);
    const steps = status === 'Rejected' ? ['Pending', 'Rejected'] : FLOW.slice(0, FLOW.indexOf(status) + 1);
    const history = steps.map((st, k) => ({ status: st, at: daysAgo(Math.max(0, ago - k * 2), 9 + k), by: k ? admin.name : 'Applicant' }));
    await db.insert('applications', {
      id: newId('app'), petId: pet.id, petName: pet.name, petBreed: pet.breed, petPhoto: pet.photos[0],
      userId: isDemo ? demo.id : null, name: applicant, email, phone: '04' + String(10000000 + i * 7654321).slice(0, 8), address: 'Melbourne VIC',
      ...form, experienceDetails: 'Grew up with dogs and cats.', motivation: `I would love to give ${pet.name} a loving forever home.`,
      score: s.score, label: s.label, breakdown: s.breakdown, notes: s.notes,
      status, history, staffNotes: '', visitAt: status === 'Visit Scheduled' ? daysAgo(-3, 11) : null,
      submittedAt: daysAgo(ago, 9), updatedAt: history[history.length - 1].at,
    });
    if (status === 'Adopted') pet.status = 'Adopted';
    else if (['Approved', 'Visit Scheduled'].includes(status) && pet.status === 'Available') pet.status = 'Pending Adoption';
  }
  for (const pet of pets) await db.insert('pets', pet);

  // 8 weeks of searches and visits so analytics charts have history
  for (let d = 56; d >= 0; d--) {
    const n = 2 + ((d * 7) % 5);
    for (let k = 0; k < n; k++) {
      const keyword = KEYWORDS[(d * 3 + k * 5) % KEYWORDS.length];
      await db.insert('searches', { id: newId('srch'), keyword, results: keyword === 'hypoallergenic' ? 0 : 1 + ((d + k) % 4), at: daysAgo(d, 8 + k) });
    }
    for (let k = 0; k < 8 + ((d * 5) % 9); k++) await db.insert('events', { id: newId('evt'), type: 'visit', at: daysAgo(d, 7 + (k % 12)) });
    for (let k = 0; k < 1 + ((d * 3) % 4); k++) await db.insert('events', { id: newId('evt'), type: 'ai_match', at: daysAgo(d, 12 + (k % 6)) });
  }

  await db.insert('notifications', { id: newId('note'), userId: demo.id, title: 'Welcome to PawPal 🐾',
    message: 'Take the AI matching quiz to find pets that suit your lifestyle.', link: 'ai-matching.html', read: false, at: daysAgo(1) });
  await db.flush();
  return true;
}

module.exports = { seedIfEmpty };
