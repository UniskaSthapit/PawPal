// npm test — end-to-end check of every main feature against a temporary database.
// Runs the real server on a spare port with a throwaway data file.
const path = require('path');
const os = require('os');
const fs = require('fs');

const dataFile = path.join(os.tmpdir(), `pawpal-test-${Date.now()}.json`);
process.env.PAWPAL_DATA_FILE = dataFile;
process.env.PORT = '0';
process.env.SMTP_HOST = '';
process.env.MONGODB_URI = '';
process.env.OPENAI_API_KEY = '';
process.env.GOOGLE_MAPS_API_KEY = '';

const { app } = require('../server');
const db = require('../src/db');
const { seedIfEmpty } = require('../src/services/seed');

let base;
let passed = 0;
const failures = [];
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); } else { failures.push(name); console.log(`  ❌ ${name} ${extra}`); }
};

// Tiny HTTP client that remembers its login cookie
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, { method, redirect: 'manual',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
}

(async () => {
  await db.init();
  await seedIfEmpty({ force: true });
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const anon = client(); const adopter = client(); const staff = client();
  const email = `tester${Date.now()}@example.com`;

  console.log('\nPublic site');
  let r = await anon('GET', '/api/pets');
  check('Lists available pets', r.status === 200 && r.body.pets.length >= 10);
  check('FR-03 hides medical/rescue fields from public', r.body.pets.every((p) => !('medicalHistory' in p) && !('rescueBackground' in p)));
  const pet = r.body.pets.find((p) => p.name === 'Max');
  r = await anon('GET', '/api/pets?q=golden%20retriever&log=1');
  check('FR-04 keyword search finds matching pets', r.body.pets.length >= 1 && r.body.pets.every((p) => /golden/i.test(p.breed)));
  r = await anon('GET', '/api/pets?type=cat');
  check('Filter by type works', r.body.pets.length > 0 && r.body.pets.every((p) => p.type === 'Cat'));
  r = await anon('GET', '/home.html');
  check('Home page is served', r.status === 200 && String(r.body).includes('petGrid'));
  r = await anon('GET', '/index.html');
  check('Staff pages redirect visitors to staff login', r.status === 302 && r.headers.get('location').includes('role=staff'));
  r = await anon('GET', '/api/applications');
  check('Staff API rejects visitors', r.status === 401);

  console.log('\nSign up + email verification');
  r = await anon('POST', '/api/auth/register', { name: 'Test Adopter', email, password: 'short' });
  check('Weak passwords are rejected', r.status === 400);
  r = await anon('POST', '/api/auth/register', { name: 'Test Adopter', email, password: 'Paws1234' });
  check('Registration succeeds', r.status === 201);
  r = await anon('POST', '/api/auth/register', { name: 'Test Adopter', email, password: 'Paws1234' });
  check('Duplicate email is rejected', r.status === 409);
  r = await adopter('POST', '/api/auth/login', { email, password: 'Paws1234', role: 'user' });
  check('Login is blocked until email is verified', r.status === 403 && r.body.code === 'EMAIL_NOT_VERIFIED');
  r = await anon('GET', `/api/dev/emails?to=${encodeURIComponent(email)}`);
  const verifyMail = r.body.emails.find((m) => m.type === 'verification');
  check('Verification email was sent', Boolean(verifyMail));
  const token = new URL(verifyMail.link).searchParams.get('token');
  r = await anon('POST', '/api/auth/verify-email', { token: 'wrong' });
  check('Invalid verification token is rejected', r.status === 400);
  r = await anon('POST', '/api/auth/verify-email', { token });
  check('Email verification succeeds', r.status === 200);
  r = await adopter('POST', '/api/auth/login', { email, password: 'wrongpass1', role: 'user' });
  check('Wrong password is rejected', r.status === 401);
  r = await adopter('POST', '/api/auth/login', { email, password: 'Paws1234', role: 'staff' });
  check('Adopter cannot use the staff login', r.status === 403);
  r = await adopter('POST', '/api/auth/login', { email, password: 'Paws1234', role: 'user' });
  check('Verified adopter can log in', r.status === 200 && r.body.redirect === 'my-applications.html');
  r = await adopter('GET', '/api/auth/me');
  check('Session cookie identifies the user', r.body.user?.email === email);
  r = await adopter('GET', '/api/applications');
  check('Adopter cannot reach staff API', r.status === 403);

  console.log('\nAdoption inquiry (FR-07) + AI score (FR-08)');
  r = await adopter('POST', '/api/applications', { petId: pet.id, name: 'Test Adopter', email, motivation: 'too short' });
  check('Incomplete inquiry is rejected', r.status === 400);
  const inquiry = { petId: pet.id, name: 'Test Adopter', email, phone: '0400000000', livingType: 'Apartment', activityLevel: 2, hoursAlone: 3,
    hasChildren: true, hasOtherPets: false, experience: 'Experienced', motivation: 'I work from home and would love a small companion for walks.' };
  r = await adopter('POST', '/api/applications', inquiry);
  check('Inquiry is submitted', r.status === 201);
  check('Adopter does not see the AI score', r.body.application && !('score' in r.body.application));
  const appId = r.body.application.id;
  r = await adopter('POST', '/api/applications', inquiry);
  check('Duplicate open application is blocked', r.status === 409);

  console.log('\nStaff portal');
  r = await staff('POST', '/api/auth/login', { email: 'admin@pawpal.com', password: 'Admin@123', role: 'staff' });
  check('Staff can log in', r.status === 200 && r.body.redirect === 'index.html');
  r = await staff('GET', '/index.html');
  check('Staff can open the dashboard page', r.status === 200);
  r = await staff('GET', `/api/applications/${appId}`);
  check('FR-08 score follows the proposal pseudocode (20+25+20+15+15 = 95)', r.body.application.score === 95 && r.body.application.label === 'High Match', JSON.stringify(r.body.application?.breakdown));
  r = await staff('GET', `/api/applications?petId=${pet.id}&sort=score`);
  check('Applicants can be ranked by score', r.body.applications.every((a, i, arr) => i === 0 || arr[i - 1].score >= a.score));
  const others = r.body.applications.filter((a) => a.id !== appId && !['Rejected', 'Adopted', 'Withdrawn'].includes(a.status));
  r = await staff('PATCH', `/api/applications/${appId}/status`, { status: 'Shortlisted' });
  check('FR-09 status → Shortlisted', r.status === 200 && r.body.application.status === 'Shortlisted');
  r = await staff('PATCH', `/api/applications/${appId}/status`, { status: 'Visit Scheduled' });
  check('Visit needs a date and time', r.status === 400);
  r = await staff('PATCH', `/api/applications/${appId}/status`, { status: 'Visit Scheduled', visitAt: new Date(Date.now() + 2 * 86400000).toISOString() });
  check('Visit scheduled', r.status === 200);
  r = await anon('GET', `/api/pets/${pet.id}`);
  check('Pet becomes "Pending Adoption" after a visit is booked', r.body.pet.status === 'Pending Adoption');
  r = await staff('PATCH', `/api/applications/${appId}/status`, { status: 'Adopted' });
  check('Adoption completed', r.status === 200);
  check('FR-12 other open applications were closed automatically', r.body.closedOthers === others.length, `closed=${r.body.closedOthers} expected=${others.length}`);
  r = await anon('GET', `/api/pets/${pet.id}`);
  check('Adopted pet is hidden from the public', r.status === 404 || r.body.pet?.status === 'Adopted');
  r = await anon('GET', `/api/dev/emails?to=${encodeURIComponent(email)}`);
  check('Adopter received status emails', r.body.emails.filter((m) => ['status-update', 'closure', 'application'].includes(m.type)).length >= 4);
  r = await adopter('GET', '/api/applications/mine');
  check('Adopter sees status "Adopted"', r.body.applications.find((a) => a.id === appId)?.status === 'Adopted');
  r = await adopter('GET', '/api/notifications');
  check('In-app notifications were created', r.body.notifications.length >= 4);

  console.log('\nPet management (FR-01/02/03)');
  r = await staff('POST', '/api/ai/describe', { name: 'Ziggy', breed: 'Staffy', type: 'Dog', age: 2, traits: 'loyal, playful', energyLevel: 3 });
  check('FR-02 AI description is generated', r.status === 200 && r.body.description.includes('Ziggy'));
  r = await staff('POST', '/api/pets', { name: 'Ziggy', type: 'Dog', breed: 'Staffy', age: 2, description: 'A lovely dog', medicalHistory: 'Secret note', status: 'Draft' });
  check('Staff can create a draft pet', r.status === 201);
  const ziggy = r.body.pet;
  r = await anon('GET', `/api/pets/${ziggy.id}`);
  check('Drafts are hidden from the public', r.status === 404);
  r = await staff('PUT', `/api/pets/${ziggy.id}`, { status: 'Available' });
  check('Staff can publish the pet', r.body.pet.status === 'Available');
  r = await anon('GET', `/api/pets/${ziggy.id}`);
  check('Published pet is public without its medical note', r.status === 200 && !('medicalHistory' in r.body.pet));
  r = await adopter('PUT', `/api/pets/${ziggy.id}`, { name: 'Hacked' });
  check('Adopters cannot edit pets', r.status === 403);
  r = await staff('DELETE', `/api/pets/${ziggy.id}`);
  check('Staff can delete a pet', r.status === 200);

  console.log('\nAI matching, chatbot, analytics, vets');
  r = await anon('POST', '/api/ai/match', { homeType: 'apartment', activity: 1, hasChildren: false, hasOtherPets: false, preferredType: 'cat', final: true });
  check('FR-05 quiz returns ranked matches', r.body.matches.length === 3 && r.body.matches[0].match >= r.body.matches[2].match);
  r = await anon('POST', '/api/ai/chat', { message: 'I live in a small apartment and want a calm cat' });
  check('FR-10 chatbot replies with pet picks', r.status === 200 && r.body.reply && r.body.picks.length > 0);
  r = await staff('GET', '/api/analytics');
  check('FR-06 analytics returns data', r.status === 200 && r.body.topKeywords.length > 0 && r.body.trend.length > 0);
  r = await staff('GET', '/api/analytics/dashboard');
  check('Dashboard stats load', r.status === 200 && typeof r.body.availablePets === 'number');
  r = await staff('GET', '/api/analytics/export?type=applications');
  check('CSV export works', r.status === 200 && String(r.body).startsWith('Applicant,Email'));
  r = await anon('GET', '/api/vets?q=Footscray');
  check('FR-11 vet endpoint answers (keyless mode)', r.status === 200 && r.body.enabled === false);

  console.log('\nAccount security');
  r = await anon('POST', '/api/auth/forgot-password', { email });
  const resetMail = (await anon('GET', `/api/dev/emails?to=${encodeURIComponent(email)}`)).body.emails.find((m) => m.type === 'password-reset');
  check('Password reset email is sent', r.status === 200 && Boolean(resetMail));
  r = await anon('POST', '/api/auth/reset-password', { token: new URL(resetMail.link).searchParams.get('token'), password: 'NewPaws567' });
  check('Password can be reset', r.status === 200);
  r = await adopter('GET', '/api/auth/me');
  check('Old sessions end after a password reset', r.body.user === null);
  r = await adopter('POST', '/api/auth/login', { email, password: 'NewPaws567', role: 'user' });
  check('New password works', r.status === 200);
  r = await staff('POST', '/api/users/staff', { name: 'New Staffer', email: `staff${Date.now()}@pawpal.com` });
  check('Staff can invite another staff member', r.status === 201);
  r = await adopter('POST', '/api/auth/logout');
  r = await adopter('GET', '/api/auth/me');
  check('Logout ends the session', r.body.user === null);

  server.close();
  await db.flush();
  fs.rmSync(dataFile, { force: true });
  console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
