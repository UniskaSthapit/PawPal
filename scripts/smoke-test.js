// npm test — end-to-end check of the main PawPal journeys against a throwaway database.
// Runs the real server on a spare port. No email, SMS or AI provider is needed (dev modes + rules engine).
const path = require('path');
const os = require('os');
const fs = require('fs');

const dataFile = path.join(os.tmpdir(), `pawpal-test-${Date.now()}.json`);
Object.assign(process.env, { PAWPAL_DATA_FILE: dataFile, PORT: '0', SMTP_HOST: '', RESEND_API_KEY: '', MONGODB_URI: '',
  OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GOOGLE_MAPS_API_KEY: '', TWILIO_ACCOUNT_SID: '', NODE_ENV: 'test' });

const { app } = require('../server');
const db = require('../src/db');
const { seedIfEmpty } = require('../src/services/seed');
const { migrate } = require('../src/services/migrate');

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
const mailFor = async (anon, email, type) => (await anon('GET', `/api/dev/emails?to=${encodeURIComponent(email)}`)).body.emails.find((m) => m.type === type);

(async () => {
  await db.init();
  await seedIfEmpty({ force: true });
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const anon = client(); const adopter = client(); const staff = client(); const admin = client(); const other = client();
  const email = `tester${Date.now()}@example.com`;

  console.log('\nPublic site & discovery');
  let r = await anon('GET', '/api/pets');
  check('Lists public pets', r.status === 200 && r.body.pets.length >= 12);
  check('Internal fields are hidden from the public', r.body.pets.every((p) => !('medicalHistory' in p) && !('rescueBackground' in p) && !('internalNotes' in p)));
  check('Drafts and adopted pets are not listed', r.body.pets.every((p) => ['Available', 'On Hold'].includes(p.status)));
  const max = r.body.pets.find((p) => p.name === 'Max');
  r = await anon('GET', '/api/pets?q=golden%20retriever&log=1');
  check('Keyword search finds matching pets', r.body.pets.length >= 1 && r.body.pets.every((p) => /golden/i.test(p.breed)));
  r = await anon('GET', '/api/pets?type=cat&size=small');
  check('Species + size filters work', r.body.pets.length > 0 && r.body.pets.every((p) => p.type === 'Cat' && p.size === 'Small'));
  r = await anon('GET', '/api/pets?apartment=1&kids=1&age=young,adult');
  check('Home/children/age filters work', r.body.pets.length > 0 && r.body.pets.every((p) => !p.requiresYard && p.goodWithChildren && p.age >= 1 && p.age <= 7));
  r = await anon('GET', '/api/pets/facets');
  check('Filter facets come from real data', r.body.breeds.includes('Beagle') && r.body.locations.length > 0);
  r = await anon('GET', `/api/pets/${max.id}?view=1`);
  check('Pet profile includes shelter information', r.status === 200 && r.body.shelter?.name && !('internalNotes' in r.body.pet));
  r = await anon('GET', '/api/stats/public');
  check('Public statistics are computed from the database', r.body.availablePets > 0 && r.body.shelters === 4);
  r = await anon('GET', '/home.html');
  check('Home page is served', r.status === 200);
  r = await anon('GET', '/index.html');
  check('Staff pages redirect visitors to staff login', r.status === 302 && r.headers.get('location').includes('role=staff'));
  r = await anon('GET', '/dashboard.html');
  check('Adopter dashboard requires login', r.status === 302 && r.headers.get('location').includes('login.html'));
  r = await anon('GET', '/api/applications');
  check('Staff API rejects visitors', r.status === 401);

  console.log('\nAI features (rules engine, grounded in the database)');
  r = await anon('POST', '/api/ai/match', { text: 'I work 9 to 5, live in an apartment, have never owned a dog before and want a friendly dog that does not require extremely high exercise.' });
  const allIds = new Set((await anon('GET', '/api/pets')).body.pets.map((p) => p.id));
  check('Matching understands the lifestyle', r.body.understood.includes('Lives in an apartment') && r.body.understood.includes('First-time owner'));
  check('Matching returns real dogs only, ranked', r.body.matches.length >= 3 && r.body.matches.every((m) => m.pet.type === 'Dog' && allIds.has(m.pet.id))
    && r.body.matches.every((m, i, a) => i === 0 || a[i - 1].score >= m.score));
  check('Each match explains why and what to consider', r.body.matches.every((m) => Array.isArray(m.reasons) && Array.isArray(m.considerations) && m.summary));
  check('Match scores never claim certainty (≤ 97%)', r.body.matches.every((m) => m.score <= 97));
  r = await anon('POST', '/api/ai/search', { query: 'Small friendly dog for first-time owner' });
  check('Natural language search converts to criteria', /small dogs/.test(r.body.interpretation) && r.body.results.every((m) => m.pet.type === 'Dog' && m.pet.size === 'Small'));
  r = await anon('POST', '/api/ai/search', { query: 'I live in an apartment and want a calm dog' });
  check('Natural language search: calm apartment dog', r.body.results.length > 0 && r.body.results.every((m) => !m.pet.requiresYard && m.pet.energyLevel <= 2));
  r = await anon('POST', '/api/ai/chat', { message: 'Which dogs would suit apartment living?' });
  check('Chatbot recommends real pets', r.body.picks.length > 0 && r.body.picks.every((p) => allIds.has(p.pet.id) && p.pet.type === 'Dog'));
  r = await anon('POST', '/api/ai/chat', { message: 'Tell me about Luna' });
  check('Chatbot answers about a specific pet', /Border Collie/.test(r.body.reply) && r.body.picks[0]?.pet.name === 'Luna');
  r = await anon('POST', '/api/ai/chat', { message: 'What happens after I apply?' });
  check('Chatbot explains the adoption process', /Under Review/.test(r.body.reply));
  r = await anon('POST', '/api/ai/chat', { message: "What's the status of my application?" });
  check('Chatbot keeps application status private when logged out', /log in/i.test(r.body.reply));
  r = await anon('POST', '/api/ai/chat', { message: 'Why did you recommend Ruby?', profile: { homeType: 'apartment', preferredType: 'dog' } });
  check('Chatbot explains a recommendation', /Ruby scored \d+%/.test(r.body.reply));
  r = await anon('POST', '/api/ai/explain-question', { key: 'hoursAlone' });
  check('Application assistant explains a question', r.status === 200 && /alone/i.test(r.body.explanation));

  console.log('\nSign up, email verification, login');
  r = await anon('POST', '/api/auth/register', { name: 'Test Adopter', email, password: 'short' });
  check('Weak passwords are rejected', r.status === 400);
  r = await anon('POST', '/api/auth/register', { name: 'Test Adopter', email, password: 'Paws1234' });
  check('Registration succeeds', r.status === 201);
  r = await anon('POST', '/api/auth/register', { name: 'Test Adopter', email, password: 'Paws1234' });
  check('Duplicate email is rejected', r.status === 409);
  r = await adopter('POST', '/api/auth/login', { email, password: 'Paws1234', role: 'user' });
  check('Login is blocked until email is verified', r.status === 403 && r.body.code === 'EMAIL_NOT_VERIFIED');
  await anon('POST', '/api/auth/resend-verification', { email });
  const verifyMail = await mailFor(anon, email, 'verification');
  check('Verification email was sent', Boolean(verifyMail));
  const token = new URL(verifyMail.link).searchParams.get('token');
  r = await anon('POST', '/api/auth/verify-email', { token: 'wrong' });
  check('Invalid verification token is rejected', r.status === 400);
  r = await anon('POST', '/api/auth/verify-email', { token });
  check('Email verification succeeds', r.status === 200);
  r = await anon('POST', '/api/auth/verify-email', { token });
  check('Verification link is single-use', r.status === 400);
  r = await adopter('POST', '/api/auth/login', { email, password: 'wrongpass1', role: 'user' });
  check('Wrong password is rejected', r.status === 401);
  r = await adopter('POST', '/api/auth/login', { email, password: 'Paws1234', role: 'staff' });
  check('Adopter cannot use the staff login', r.status === 403);
  r = await adopter('POST', '/api/auth/login', { email, password: 'Paws1234', role: 'user' });
  check('Verified adopter logs in and lands on the dashboard', r.status === 200 && r.body.redirect === 'dashboard.html');
  r = await adopter('GET', '/api/applications');
  check('Adopter cannot reach staff API', r.status === 403);
  r = await adopter('GET', '/api/admin/users');
  check('Adopter cannot reach admin API', r.status === 403);

  console.log('\nPhone verification (dev SMS)');
  r = await adopter('POST', '/api/auth/phone/send', { countryCode: '+61', phone: 'abc' });
  check('Invalid phone numbers are rejected', r.status === 400);
  r = await adopter('POST', '/api/auth/phone/send', { countryCode: '+61', phone: '0412 345 678' });
  check('Verification code is sent', r.status === 200 && r.body.phone === '+61412345678');
  r = await adopter('POST', '/api/auth/phone/send', { countryCode: '+61', phone: '0412 345 678' });
  check('Resending is rate-limited', r.status === 429);
  const sms = (await anon('GET', '/api/dev/sms')).body.messages.find((m) => m.to === '+61412345678');
  const code = sms.body.match(/\d{6}/)[0];
  r = await adopter('POST', '/api/auth/phone/verify', { code: code === '000000' ? '111111' : '000000' });
  check('Wrong code is rejected', r.status === 400);
  r = await adopter('POST', '/api/auth/phone/verify', { code });
  check('Correct code verifies the phone', r.status === 200 && r.body.user.phoneVerified === true);

  console.log('\nFavourites, matching profile, enquiries');
  r = await adopter('POST', `/api/favourites/${max.id}`);
  check('Favourite a pet', r.status === 201);
  r = await adopter('GET', '/api/favourites');
  check('Favourites are stored in the database', r.body.ids.includes(max.id) && r.body.pets[0]?.name === 'Max');
  r = await adopter('POST', '/api/ai/match', { text: 'Apartment, relaxed, no kids, want a small dog' });
  check('Logged-in matching saves the lifestyle profile', r.body.saved === true);
  r = await adopter('GET', '/api/ai/recommendations');
  check('Dashboard recommendations use the saved profile', r.body.hasProfile && r.body.matches.length > 0);
  r = await adopter('POST', '/api/ai/chat', { message: 'I live in an apartment and want a calm dog' });
  const convoId = r.body.conversationId;
  check('Chat conversation is saved for adopters', Boolean(convoId));
  r = await adopter('POST', '/api/ai/chat', { message: 'Why did you recommend them?', conversationId: convoId, lastPetIds: r.body.picks.map((p) => p.pet.id) });
  r = await adopter('GET', `/api/ai/conversations/${convoId}`);
  check('Conversation history persists', r.body.conversation.messages.length === 4);
  r = await other('GET', `/api/ai/conversations/${convoId}`);
  check('Conversations are private', r.status === 401 || r.status === 404);
  r = await adopter('POST', '/api/enquiries', { petId: max.id, message: 'Is Max okay with being alone for a few hours?' });
  check('Adopter can ask the shelter about a pet', r.status === 201);
  const enqId = r.body.enquiry.id;

  console.log('\nAdoption application');
  r = await adopter('POST', '/api/applications', { petId: max.id, name: 'Test Adopter', email, motivation: 'too short' });
  check('Incomplete application is rejected', r.status === 400);
  const form = { petId: max.id, name: 'Test Adopter', email, phone: '0400000000', livingType: 'Apartment', ownership: 'Rent', activityLevel: 2, hoursAlone: 3,
    hasChildren: true, hasOtherPets: false, experience: 'Experienced', motivation: 'I work from home and would love a small companion for walks.' };
  r = await adopter('POST', '/api/applications', form);
  check('Declaration must be confirmed', r.status === 400);
  r = await adopter('POST', '/api/applications', { ...form, declaration: true });
  check('Application is submitted', r.status === 201 && r.body.application.status === 'Submitted');
  check('Adopter does not see the suitability score', !('score' in r.body.application));
  const appId = r.body.application.id;
  r = await adopter('POST', '/api/applications', { ...form, declaration: true });
  check('Duplicate open application is blocked', r.status === 409);

  console.log('\nShelter staff');
  r = await staff('POST', '/api/auth/login', { email: 'staff@pawpal.com', password: 'Staff@123', role: 'staff' });
  check('Staff can log in', r.status === 200 && r.body.redirect === 'index.html');
  r = await staff('GET', `/api/applications/${appId}`);
  check('Staff outside the pet\'s shelter cannot see the application', r.status === 404);
  r = await staff('GET', '/api/applications');
  check('Staff only see their own shelter\'s applications', r.body.applications.length > 0 && new Set(r.body.applications.map((a) => a.shelterId)).size === 1);
  r = await admin('POST', '/api/auth/login', { email: 'admin@pawpal.com', password: 'Admin@123', role: 'staff' });
  check('Admin can log in through the staff tab', r.status === 200);
  r = await admin('GET', `/api/applications/${appId}`);
  check('Suitability score follows the proposal (20+25+20+15+15 = 95)', r.body.application.score === 95 && r.body.application.label === 'High Match');
  r = await admin('GET', `/api/ai/applications/${appId}/summary`);
  check('AI application summary', r.status === 200 && /Test Adopter applied for Max/.test(r.body.summary));
  const others = (await admin('GET', `/api/applications?petId=${max.id}`)).body.applications.filter((a) => a.id !== appId && !['Declined', 'Adopted', 'Withdrawn'].includes(a.status));
  r = await admin('PATCH', `/api/applications/${appId}/status`, { status: 'Under Review' });
  check('Status → Under Review', r.status === 200 && r.body.application.status === 'Under Review');
  r = await admin('PATCH', `/api/applications/${appId}/status`, { status: 'Info Requested' });
  check('Info request needs a message', r.status === 400);
  r = await admin('PATCH', `/api/applications/${appId}/status`, { status: 'Info Requested', message: 'Please send your landlord approval.' });
  check('Status → Info Requested', r.status === 200);
  r = await adopter('POST', `/api/applications/${appId}/messages`, { text: 'Attached — my landlord is happy for a small dog.' });
  check('Adopter reply sends it back to review', r.status === 200 && r.body.application.status === 'Under Review');
  r = await admin('PATCH', `/api/applications/${appId}/status`, { status: 'Meet & Greet' });
  check('Appointments need a date and time', r.status === 400);
  r = await admin('PATCH', `/api/applications/${appId}/status`, { status: 'Meet & Greet', appointmentAt: new Date(Date.now() + 2 * 86400000).toISOString() });
  check('Meet & greet scheduled', r.status === 200 && r.body.application.appointmentAt);
  r = await anon('GET', `/api/pets/${max.id}`);
  check('Pet is On Hold during the meet & greet', r.body.pet.status === 'On Hold');
  r = await admin('PATCH', `/api/applications/${appId}/status`, { status: 'Approved' });
  r = await admin('PATCH', `/api/applications/${appId}/status`, { status: 'Adoption Scheduled', appointmentAt: new Date(Date.now() + 5 * 86400000).toISOString() });
  r = await admin('PATCH', `/api/applications/${appId}/status`, { status: 'Adopted' });
  check('Adoption completed', r.status === 200);
  check('Other open applications for the pet were closed', r.body.closedOthers === others.length, `closed=${r.body.closedOthers} expected=${others.length}`);
  r = await anon('GET', '/api/pets');
  check('Adopted pet leaves the public list', !r.body.pets.some((p) => p.id === max.id));
  r = await admin('PATCH', `/api/applications/${appId}/status`, { status: 'Under Review' });
  check('Completed adoptions cannot be changed', r.status === 400);
  r = await adopter('GET', '/api/applications/mine');
  const mine = r.body.applications.find((a) => a.id === appId);
  check('Adopter timeline shows full status history', mine?.status === 'Adopted' && mine.history.length === 8 && mine.messages.length >= 2);
  r = await anon('GET', `/api/dev/emails?to=${encodeURIComponent(email)}`);
  check('Adopter received emails for each step', r.body.emails.filter((m) => ['status-update', 'closure', 'application', 'message'].includes(m.type)).length >= 7);
  r = await adopter('GET', '/api/notifications');
  check('In-app notifications were created', r.body.unread >= 6);
  await adopter('POST', `/api/notifications/${r.body.notifications[0].id}/read`);
  const before = r.body.unread;
  r = await adopter('GET', '/api/notifications');
  check('Mark one notification read', r.body.unread === before - 1);
  await adopter('POST', '/api/notifications/read-all');
  r = await adopter('GET', '/api/notifications');
  check('Mark all read', r.body.unread === 0);

  console.log('\nEnquiries, pet management, assistant, analytics');
  r = await staff('POST', `/api/enquiries/${enqId}/reply`, { reply: 'Yes, he copes well.' });
  check('Staff cannot answer another shelter\'s enquiry', r.status === 404);
  r = await admin('POST', `/api/enquiries/${enqId}/reply`, { reply: 'Yes — Max copes well with a few hours alone once settled.' });
  check('Shelter replies to an enquiry', r.status === 200 && r.body.enquiry.status === 'Answered');
  r = await adopter('GET', '/api/enquiries/mine');
  check('Adopter sees the reply', r.body.enquiries.find((e) => e.id === enqId)?.reply.includes('copes well'));
  r = await staff('POST', '/api/ai/describe', { name: 'Ziggy', breed: 'Staffy', type: 'Dog', age: 2, traits: 'loyal, playful', energyLevel: 3 });
  check('AI pet description is generated', r.status === 200 && r.body.description.includes('Ziggy'));
  r = await staff('POST', '/api/pets', { name: 'Ziggy', type: 'Dog', breed: 'Staffy', age: 2, description: 'A lovely dog', internalNotes: 'Secret note', status: 'Draft' });
  check('Staff can create a draft pet', r.status === 201 && r.body.pet.shelterId);
  const ziggy = r.body.pet;
  r = await anon('GET', `/api/pets/${ziggy.id}`);
  check('Drafts are hidden from the public', r.status === 404);
  r = await staff('PUT', `/api/pets/${ziggy.id}`, { status: 'Available', photos: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='] });
  check('Staff can publish the pet with an uploaded photo', r.body.pet.status === 'Available' && /^\/api\/images\//.test(r.body.pet.photos[0]));
  r = await anon('GET', r.body.pet.photos[0]);
  check('Uploaded photo is served', r.status === 200);
  r = await anon('GET', `/api/pets/${ziggy.id}`);
  check('Published pet is public without internal notes', r.status === 200 && !('internalNotes' in r.body.pet));
  r = await adopter('POST', `/api/favourites/${ziggy.id}`);
  r = await staff('PUT', `/api/pets/${ziggy.id}`, { status: 'Archived' });
  check('Staff can archive a pet', r.body.pet.status === 'Archived');
  r = await adopter('GET', '/api/notifications');
  check('People who saved the pet are told it is unavailable', r.body.notifications.some((n) => /Ziggy is no longer available/.test(n.title)));
  r = await adopter('PUT', `/api/pets/${ziggy.id}`, { name: 'Hacked' });
  check('Adopters cannot edit pets', r.status === 403);
  r = await staff('POST', '/api/ai/shelter', { question: 'Which applications need review?' });
  check('Shelter AI assistant lists applications to review', r.status === 200 && Array.isArray(r.body.items) && r.body.reply);
  r = await staff('POST', '/api/ai/shelter', { question: 'Which pets have received no enquiries?' });
  check('Shelter AI assistant finds pets with no enquiries', r.status === 200 && /enquir/i.test(r.body.reply));
  r = await staff('GET', '/api/analytics');
  check('Analytics returns funnel and trends', r.status === 200 && r.body.funnel.length === 5 && r.body.trend.length > 0);
  r = await staff('GET', '/api/analytics/insights');
  check('Analytics insights come from real data', r.status === 200 && r.body.insights.length > 0);
  r = await staff('GET', '/api/analytics/dashboard');
  check('Dashboard stats load', r.status === 200 && typeof r.body.availablePets === 'number');
  r = await staff('GET', '/api/analytics/export?type=applications');
  check('CSV export works', r.status === 200 && String(r.body).startsWith('Applicant,Email'));

  console.log('\nAdministration');
  r = await staff('GET', '/api/admin/users');
  check('Staff cannot reach admin API', r.status === 403);
  r = await admin('GET', '/api/admin/users');
  check('Admin can list users', r.status === 200 && r.body.users.length >= 4);
  r = await admin('GET', '/api/admin/shelters');
  check('Admin can list shelters', r.body.shelters.length === 4);
  r = await admin('POST', '/api/admin/shelters', { name: 'PawPal Adelaide', suburb: 'Norwood', state: 'SA' });
  check('Admin can add a shelter', r.status === 201);
  const shelterId = r.body.shelter.id;
  r = await admin('POST', '/api/admin/users', { name: 'New Staffer', email: `staff${Date.now()}@pawpal.com`, role: 'staff', shelterId });
  check('Admin can invite staff', r.status === 201);
  const target = (await admin('GET', `/api/admin/users?q=${encodeURIComponent(email)}`)).body.users[0];
  r = await admin('PATCH', `/api/admin/users/${target.id}`, { active: false });
  check('Admin can deactivate a user', r.status === 200);
  r = await adopter('GET', '/api/auth/me');
  check('Deactivated users are signed out', r.body.user === null);
  await admin('PATCH', `/api/admin/users/${target.id}`, { active: true });

  console.log('\nAccount security');
  r = await anon('POST', '/api/auth/forgot-password', { email });
  const resetMail = await mailFor(anon, email, 'password-reset');
  check('Password reset email is sent', r.status === 200 && Boolean(resetMail));
  const resetToken = new URL(resetMail.link).searchParams.get('token');
  r = await anon('POST', '/api/auth/reset-password', { token: resetToken, password: 'NewPaws567' });
  check('Password can be reset', r.status === 200);
  r = await anon('POST', '/api/auth/reset-password', { token: resetToken, password: 'OtherPaws9' });
  check('Reset links are single-use', r.status === 400);
  r = await adopter('POST', '/api/auth/login', { email, password: 'NewPaws567', role: 'user' });
  check('New password works', r.status === 200);
  r = await adopter('POST', '/api/auth/logout');
  r = await adopter('GET', '/api/auth/me');
  check('Logout ends the session', r.body.user === null);

  console.log('\nMigration of legacy data');
  const legacyPet = (await db.find('pets'))[0];
  await db.insert('applications', { id: 'app_legacy', petId: legacyPet.id, petName: legacyPet.name, status: 'Visit Scheduled', visitAt: new Date().toISOString(),
    history: [{ status: 'Pending', at: new Date().toISOString() }, { status: 'Visit Scheduled', at: new Date().toISOString() }], submittedAt: new Date().toISOString() });
  await db.update('meta', 'schema', { version: 1 });
  await migrate();
  const legacy = await db.findOne('applications', { id: 'app_legacy' });
  check('Legacy statuses are upgraded', legacy.status === 'Meet & Greet' && legacy.history[0].status === 'Submitted' && legacy.appointmentAt && legacy.shelterId);

  console.log('\nOwner administrator & production safeguards');
  const config = require('../src/config');
  const { ensureOwnerAdmin, disableDemoAccountsInProduction } = require('../src/services/bootstrap');
  const created = await ensureOwnerAdmin('owner@example.com');
  check('ADMIN_EMAIL creates an administrator account', created.status === 'created' && created.user.role === 'admin');
  const setup = await mailFor(anon, 'owner@example.com', 'password-reset');
  check('Owner is emailed a single-use set-password link', Boolean(setup) && /reset-password\.html\?token=/.test(setup.link));
  r = await anon('POST', '/api/auth/reset-password', { token: new URL(setup.link).searchParams.get('token'), password: 'OwnerPaws99' });
  const owner = client();
  r = await owner('POST', '/api/auth/login', { email: 'owner@example.com', password: 'OwnerPaws99', role: 'staff' });
  check('Owner can set a password and log in as administrator', r.status === 200 && r.body.user.role === 'admin');
  check('Running the bootstrap again changes nothing', (await ensureOwnerAdmin('owner@example.com')).status === 'ok');
  config.isProd = true;
  const disabled = await disableDemoAccountsInProduction();
  config.isProd = false;
  check('Production deactivates demo accounts that still use published passwords', disabled.includes('staff@pawpal.com') && disabled.includes('user@pawpal.com'));
  r = await staff('GET', '/api/auth/me');
  check('Deactivated demo sessions end immediately', r.body.user === null);

  server.close();
  await db.flush();
  fs.rmSync(dataFile, { force: true });
  console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
