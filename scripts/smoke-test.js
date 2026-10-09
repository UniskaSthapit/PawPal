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

// Tiny HTTP client with a cookie jar (login cookie, and the short-lived 2FA pending cookie)
function client() {
  const jar = new Map();
  return async (method, url, body) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + url, { method, redirect: 'manual',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    for (const set of res.headers.getSetCookie()) {
      const [pair] = set.split(';'); const i = pair.indexOf('=');
      const name = pair.slice(0, i); const value = pair.slice(i + 1);
      if (!value || /expires=Thu, 01 Jan 1970/i.test(set)) jar.delete(name); else jar.set(name, value);
    }
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
  for (const [type, re] of [['reptile', /Reptile/], ['bird', /Bird/], ['fish', /Fish/], ['farm', /Farm Animal/], ['small', /Rabbit|Guinea Pig|Hamster|Other/]]) {
    const g = await anon('GET', `/api/pets?type=${type}`);
    check(`Species filter "${type}" returns only that kind`, g.body.pets.length >= 2 && g.body.pets.every((p) => re.test(p.type)));
  }
  const reptiles = await anon('GET', '/api/pets?type=reptile');
  check('New species carry a care guide and health notes', reptiles.body.pets.every((p) => p.care?.lifespan && p.healthChecks?.length));
  const contacts = await anon('GET', '/api/shelters');
  check('Shelters list a real contact email and the website', contacts.body.shelters.every((s) => !/@pawpal\.app$/.test(s.email) && /^https?:\/\//.test(s.website)));
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
  r = await anon('POST', '/api/ai/chat', { message: 'I live in an apartment and want a calm cat' });
  const catProfile = r.body.profile; const catIds = r.body.picks.map((p) => p.pet.id);
  check('Chat suggests cats when asked for a cat', r.body.picks.length > 0 && r.body.picks.every((p) => p.pet.type === 'Cat'));
  r = await anon('POST', '/api/ai/chat', { message: 'what about dogs?', profile: catProfile, lastPetIds: catIds });
  check('Chat switches to dogs when the request changes', r.body.picks.length > 0 && r.body.picks.every((p) => p.pet.type === 'Dog') && r.body.profile.homeType === 'apartment');
  r = await anon('POST', '/api/ai/chat', { message: 'hi', profile: catProfile });
  check('Chat greets without listing pets', r.body.picks.length === 0 && /looking for homes/.test(r.body.reply));
  r = await anon('POST', '/api/ai/chat', { message: 'do you have an elephant?', profile: catProfile });
  check('Chat says when an animal is not available', r.body.picks.length === 0 && /don.t have any elephants/i.test(r.body.reply) && /\d+ dogs/.test(r.body.reply));
  r = await anon('POST', '/api/ai/chat', { message: 'any ferrets?' });
  check('Chat says when a kind of pet has none listed', r.body.picks.length === 0 && /don.t have any ferrets/i.test(r.body.reply));
  r = await anon('POST', '/api/ai/chat', { message: 'do you have any snakes?' });
  check('Chat shows snakes when asked, and only snakes', r.body.picks.length > 0 && r.body.picks.every((p) => /python|snake/i.test(p.pet.breed)));
  r = await anon('POST', '/api/ai/chat', { message: 'do you have cows?' });
  check('Chat shows cows when asked', r.body.picks.length > 0 && r.body.picks.every((p) => /\bcow\b/i.test(p.pet.breed)));
  r = await anon('POST', '/api/ai/chat', { message: 'do you have hamsters?', profile: catProfile });
  check('Chat shows only the kind of animal asked for', r.body.picks.length > 0 && r.body.picks.every((p) => /hamster/i.test(p.pet.breed)));
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
  await new Promise((resolve) => { setTimeout(resolve, 150); }); // notification emails are sent in the background
  r = await anon('GET', '/api/dev/emails?to=admin%40pawpal.com');
  check('Staff in-app notifications are emailed too', r.body.emails.some((m) => m.type === 'notification' && /New question about Max/.test(m.subject)));


  console.log('\nAdoption application');
  r = await adopter('POST', '/api/applications', { petId: max.id, name: 'Test Adopter', email, motivation: 'too short' });
  check('Incomplete application is rejected', r.status === 400);
  const form = { petId: max.id, name: 'Test Adopter', email, phone: '0400000000', livingType: 'Apartment', ownership: 'Rent', activityLevel: 2, hoursAlone: 3,
    hasChildren: true, hasOtherPets: false, experience: 'Experienced', motivation: 'I work from home and would love a small companion for walks.' };
  r = await adopter('POST', '/api/applications', form);
  check('Declaration must be confirmed', r.status === 400);
  const appCount = (await db.find('applications')).length;
  for (const phone of ['04ABC12345', '0412345', '0412345678901234', '0412#345#678']) {
    r = await adopter('POST', '/api/applications', { ...form, phone, declaration: true });
    check(`Invalid mobile number "${phone}" is rejected`, r.status === 400 && /mobile number/.test(r.body.error), JSON.stringify(r.body));
  }
  check('Rejected applications are not saved', (await db.find('applications')).length === appCount);
  {
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":' });
    const body = await res.json();
    check('Invalid JSON gets a clear 400 error', res.status === 400 && /invalid JSON/.test(body.error), JSON.stringify(body));
  }
  r = await adopter('POST', '/api/applications', { ...form, email: 'not-an-email', declaration: true });
  check('Invalid email address is rejected', r.status === 400);
  r = await adopter('POST', '/api/applications', { ...form, petId: 'pet_doesnotexist', declaration: true });
  check('Application for an unknown pet is rejected', r.status === 400);
  r = await adopter('POST', '/api/applications', { ...form, declaration: true });
  check('Application is submitted', r.status === 201 && r.body.application.status === 'Submitted');
  check('Adopter does not see the suitability score', !('score' in r.body.application));
  check('Application confirmation is emailed to the applicant', r.body.email?.sent?.includes(email) && Boolean(await mailFor(anon, email, 'application')));
  const appId = r.body.application.id;
  r = await adopter('POST', '/api/applications', { ...form, declaration: true });
  check('Duplicate open application is blocked', r.status === 409);
  const otherPet = (await anon('GET', '/api/pets')).body.pets.find((p) => p.id !== max.id && p.status === 'Available');
  const altEmail = `alt${Date.now()}@example.com`;
  r = await adopter('POST', '/api/applications', { ...form, petId: otherPet.id, email: altEmail, declaration: true });
  check('Confirmation goes to both the form email and the account email', r.status === 201 && r.body.email.sent.length === 2 && Boolean(await mailFor(anon, altEmail, 'application')));
  await adopter('POST', `/api/applications/${r.body.application.id}/withdraw`);

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
  check('Status change is emailed and reported to staff', r.body.emailSent === true && /We emailed/.test(r.body.message) && Boolean(await mailFor(anon, email, 'status-update')));
  // Email settings: adopters can turn application emails off; the in-app notification still happens
  for (const [phone, ok] of [['12345678', true], ['123456789012345', true], ['+61 (412) 345-678', true], ['1234567', false],
    ['1234567890123456', false], ['04ABC12345', false], ['', true]]) {
    r = await adopter('PATCH', '/api/users/me', { phone });
    check(`Profile mobile number "${phone}" is ${ok ? 'accepted' : 'rejected'}`, r.status === (ok ? 200 : 400), JSON.stringify(r.body));
  }
  r = await anon('PATCH', '/api/users/me', { emailPrefs: { applications: false } });
  check('Email settings need a login', r.status === 401);
  r = await adopter('PATCH', '/api/users/me', { emailPrefs: 'off' });
  check('Email settings are validated', r.status === 400);
  r = await adopter('PATCH', '/api/users/me', { emailPrefs: { applications: 'no' } });
  check('Email settings must be on/off values', r.status === 400);
  r = await adopter('PATCH', '/api/users/me', { emailPrefs: { applications: false } });
  check('Adopter can turn off application emails', r.status === 200 && r.body.user.emailPrefs.applications === false && r.body.user.emailPrefs.activity === true);
  r = await admin('PATCH', `/api/applications/${appId}/status`, { status: 'Interview', appointmentAt: new Date(Date.now() + 86400000).toISOString() });
  const skippedMail = (await anon('GET', `/api/dev/emails?to=${encodeURIComponent(email)}`)).body.emails.find((m) => /Interview/.test(m.subject));
  const interviewNote = (await adopter('GET', '/api/notifications')).body.notifications.find((n) => /Interview/.test(n.title));
  check('Opted-out adopter: email skipped with a reason, staff told, in-app notification kept',
    r.status === 200 && r.body.emailStatus === 'skipped' && /turned off application emails/.test(r.body.message)
    && skippedMail?.status === 'skipped' && /turned off/.test(skippedMail.error) && Boolean(interviewNote));
  r = await adopter('PATCH', '/api/users/me', { emailPrefs: { applications: true } });
  check('Adopter can turn application emails back on', r.body.user.emailPrefs.applications === true);
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
  check('Adopter timeline shows full status history', mine?.status === 'Adopted' && mine.history.length === 9 /* 8 journey steps + the Interview used by the email-settings test */ && mine.messages.length >= 2);
  console.log('\nFirst 30 days care plan');
  let planned = null;
  for (let i = 0; i < 40 && !planned?.carePlan; i++) { planned = await db.findOne('applications', { id: appId }); if (!planned.carePlan) await new Promise((ok) => setTimeout(ok, 50)); }
  const plan = planned.carePlan;
  check('Approving an application creates a care plan stored on it', plan && plan.sections.length === 9 && plan.generatedAt && plan.source === 'rules'
    && ['before', 'days1to3', 'week1', 'weeks2to4', 'feeding', 'exercise', 'vet', 'training', 'warning'].every((k, i) => plan.sections[i].key === k && plan.sections[i].items.length >= 2));
  check('The plan says it is general guidance, not veterinary advice', plan.disclaimer === 'This is general guidance, not veterinary advice.');
  check('The adopter sees that the care plan is ready', mine.carePlanReady === true);
  r = await anon('GET', `/api/applications/${appId}/care-plan`);
  check('Care plan needs a login', r.status === 401);
  r = await adopter('GET', `/api/applications/${appId}/care-plan`);
  check('Adopter can open their care plan', r.status === 200 && r.body.carePlan.sections.length === 9 && r.body.canRegenerate === false && r.body.pet.name === max.name);
  const otherApp = (await db.find('applications')).find((x) => x.userId && x.userId !== planned.userId && x.carePlan);
  r = await adopter('GET', `/api/applications/${otherApp.id}/care-plan`);
  check('Adopters cannot open someone else\'s care plan', r.status === 404);
  r = await adopter('GET', '/api/notifications');
  check('In-app notification: your care plan is ready', r.body.notifications.some((n) => n.type === 'careplan' && n.link === `care-plan.html?id=${appId}`));
  r = await anon('GET', `/api/dev/emails?to=${encodeURIComponent(email)}`);
  check('…and an email', r.body.emails.some((m) => /care plan is ready/i.test(m.subject)));
  r = await adopter('POST', `/api/applications/${appId}/care-plan`);
  check('Only staff can regenerate a care plan', r.status === 403);
  const earlyApp = (await db.find('applications')).find((x) => x.status === 'Submitted');
  r = await admin('POST', `/api/applications/${earlyApp.id}/care-plan`);
  check('Care plans are only for approved applications', r.status === 400);
  r = await admin('GET', `/api/applications/${appId}/care-plan`);
  check('Staff can view the care plan and regenerate it', r.status === 200 && r.body.canRegenerate === true);
  r = await admin('POST', `/api/applications/${appId}/care-plan`);
  check('Staff regenerate the care plan', r.status === 200 && r.body.carePlan.sections.length === 9 && /regenerated/.test(r.body.message));
  {
    const { rulesPlan, generateCarePlan } = require('../src/services/careplan');
    const text = (type) => JSON.stringify(rulesPlan({ name: 'Test', type }, {}).sections).toLowerCase();
    check('Rules templates are species-specific', /harness/.test(text('Dog')) && /litter/.test(text('Cat')) && /hay/.test(text('Rabbit')) && /uvb/.test(text('Reptile')) && /aquarium/.test(text('Fish')));
    check('Lifestyle answers personalise the plan', /other pets slowly/.test(JSON.stringify(rulesPlan({ name: 'Rex', type: 'Dog' }, { hasOtherPets: true }))));
    const llm = require('../src/services/llm');
    const real = { llmEnabled: llm.llmEnabled, provider: llm.provider, complete: llm.complete };
    let sent = '';
    const keys = ['before', 'days1to3', 'week1', 'weeks2to4', 'feeding', 'exercise', 'vet', 'training', 'warning'];
    const fullApp = await db.findOne('applications', { id: appId });
    const petRow = await db.findOne('pets', { id: fullApp.petId });
    const { toPublic } = require('../src/routes/pets');
    try {
      Object.assign(llm, { llmEnabled: true, provider: 'gemini', complete: async ({ messages }) => { sent = messages[0].content;
        return { intro: 'Welcome home, a plan for the first month.', sections: Object.fromEntries(keys.map((k) => [k, [`AI ${k} step one here`, `AI ${k} step two here`]])) }; } });
      let p2 = await generateCarePlan(toPublic(petRow), fullApp);
      check('With AI, the plan is personalised and validated', p2.source === 'gemini' && p2.sections[0].items[0] === 'AI before step one here');
      check('Only public pet fields and lifestyle answers are sent to the AI', !sent.includes(fullApp.email) && !sent.includes(fullApp.name)
        && !(fullApp.phone && sent.includes(fullApp.phone)) && !(petRow.medicalHistory && sent.includes(petRow.medicalHistory.slice(0, 20))) && /livingType/.test(sent));
      llm.complete = async () => ({ intro: 'x', sections: { before: ['only one section'] } });
      p2 = await generateCarePlan(toPublic(petRow), fullApp);
      check('Incomplete AI output falls back to the species template', p2.source === 'rules' && p2.sections.length === 9);
    } finally { Object.assign(llm, real); }
  }

  console.log('\nAdoption fee (payment simulation)');
  const logged = [];
  const origLog = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(origLog)) console[k] = (...a) => { logged.push(a.map((x) => (typeof x === 'string' ? x : require('util').inspect(x, { depth: 5 }))).join(' ')); origLog[k](...a); };
  const card = (number, extra = {}) => ({ applicationId: appId, card: { name: 'Test Adopter', number, expiry: '12/39', cvc: '123', ...extra } });
  try {
    r = await anon('GET', `/api/payments/application/${appId}`);
    check('Checkout needs a login', r.status === 401);
    r = await adopter('GET', `/api/payments/application/${appId}`);
    check('Adopted application shows the adoption fee due', r.status === 200 && r.body.amount === max.adoptionFee && r.body.paymentStatus === 'due' && r.body.simulation === true && r.body.testCards.length === 3);
    r = await adopter('GET', '/api/applications/mine');
    check('My Applications shows "Adoption fee due"', r.body.applications.find((a) => a.id === appId).payment?.status === 'due');
    r = await anon('POST', '/api/payments/checkout', card('4242424242424242'));
    check('Paying needs a login', r.status === 401);
    r = await admin('POST', '/api/payments/checkout', card('4242424242424242'));
    check('Only adopters pay', r.status === 403);
    for (const [label, body, field, re] of [
      ['name', card('4242424242424242', { name: '' }), 'name', /name/],
      ['Luhn check', card('4242424242424241'), 'number', /isn't valid/],
      ['test cards only', card('4111111111111111'), 'number', /Use a test card/],
      ['expiry in the future', card('4242424242424242', { expiry: '01/20' }), 'expiry', /expired/],
      ['expiry format', card('4242424242424242', { expiry: '13/30' }), 'expiry', /month/],
      ['3-digit CVC', card('4242424242424242', { cvc: '12' }), 'cvc', /CVC/],
    ]) {
      r = await adopter('POST', '/api/payments/checkout', body);
      check(`Card validation: ${label}`, r.status === 400 && r.body.field === field && re.test(r.body.error), JSON.stringify(r.body));
    }
    r = await adopter('POST', '/api/payments/checkout', card('4000 0000 0000 0002'));
    check('Test card 4000…0002 is declined', r.status === 402 && r.body.code === 'declined');
    r = await adopter('POST', '/api/payments/checkout', card('4000000000009995'));
    check('Test card 4000…9995 has insufficient funds', r.status === 402 && r.body.code === 'insufficient_funds');
    r = await adopter('GET', `/api/payments/application/${appId}`);
    check('A failed payment leaves the fee due', r.body.paymentStatus === 'due');
    r = await adopter('POST', '/api/payments/pay-in-person', { applicationId: appId });
    check('Adopter can choose to pay at the shelter', r.status === 200 && r.body.paymentStatus === 'pay_in_person');
    r = await adopter('POST', '/api/payments/pay-in-person', { applicationId: appId });
    check('Choosing it again is harmless', r.status === 200);
    const [p1, p2] = await Promise.all([adopter('POST', '/api/payments/checkout', card('4242424242424242')), adopter('POST', '/api/payments/checkout', card('4242424242424242'))]);
    const okPay = [p1, p2].find((x) => x.status === 201);
    check('Two clicks at once charge only once', okPay && [p1, p2].filter((x) => x.status === 201).length === 1 && [p1, p2].some((x) => x.status === 409), JSON.stringify([p1.status, p2.status]));
    const receipt = okPay.body.payment;
    check('Test card 4242… succeeds with a receipt (brand + last 4 only)', /^PP-\d{8}-[0-9A-F]{6}$/.test(receipt.receiptNo) && receipt.brand === 'Visa' && receipt.last4 === '4242'
      && Object.keys(receipt).sort().join() === 'amount,applicationId,brand,id,last4,paidAt,receiptNo,status,userId');
    r = await adopter('POST', '/api/payments/checkout', card('4242424242424242'));
    check('A paid adoption cannot be charged again', r.status === 409 && r.body.payment.id === receipt.id);
    check('Exactly one successful payment is stored', (await db.find('payments', { applicationId: appId })).filter((x) => x.status === 'succeeded').length === 1);
    r = await adopter('GET', `/api/payments/${receipt.id}`);
    check('Adopter can open the receipt', r.status === 200 && r.body.payment.receiptNo === receipt.receiptNo && r.body.simulation === true);
    r = await anon('GET', `/api/payments/${receipt.id}`);
    check('Receipts need a login', r.status === 401);
    r = await admin('GET', `/api/payments/${receipt.id}`);
    check('Staff can open the receipt', r.status === 200);
    r = await adopter('GET', '/api/notifications');
    check('In-app notification for the payment', r.body.notifications.some((n) => n.type === 'payment' && n.link === `receipt.html?id=${receipt.id}`));
    await new Promise((ok) => setTimeout(ok, 100));
    r = await anon('GET', `/api/dev/emails?to=${encodeURIComponent(email)}`);
    check('Receipt email sent', r.body.emails.some((m) => m.type === 'receipt' && m.subject.includes(receipt.receiptNo)));

    // The demo adopter's seeded adoption: staff record a payment taken at the shelter
    const demoUser = client();
    await demoUser('POST', '/api/auth/login', { email: 'user@pawpal.com', password: 'User@123' });
    const demoApp = (await db.find('applications')).find((x) => x.email === 'user@pawpal.com' && x.status === 'Adopted');
    r = await demoUser('GET', `/api/payments/application/${appId}`);
    check('Adopters cannot see someone else\'s checkout', r.status === 404);
    r = await demoUser('GET', `/api/payments/${receipt.id}`);
    check('…or receipt', r.status === 404);
    r = await demoUser('GET', `/api/payments/application/${demoApp.id}`);
    check('Seeded demo adoption has a fee due', r.status === 200 && r.body.paymentStatus === 'due' && r.body.amount > 0);
    r = await demoUser('POST', `/api/payments/application/${demoApp.id}/record`);
    check('Only staff record in-person payments', r.status === 403);
    r = await admin('POST', `/api/payments/application/${demoApp.id}/record`);
    check('Staff record a payment taken at the shelter', r.status === 201 && r.body.payment.brand === 'Paid at the shelter' && r.body.payment.last4 === null);
    r = await demoUser('POST', '/api/payments/checkout', { applicationId: demoApp.id, card: { name: 'Jordan', number: '4242424242424242', expiry: '12/39', cvc: '123' } });
    check('…after which it cannot be paid again', r.status === 409);
    r = await admin('GET', '/api/analytics');
    check('Analytics shows adoption fees collected', r.status === 200 && r.body.fees.collected >= receipt.amount + demoApp.feeDue && r.body.fees.collectedAllTime >= r.body.fees.collected);
    r = await admin('GET', `/api/applications/${appId}`);
    check('Staff see the payment status on the application', r.body.application.paymentStatus === 'paid' && r.body.application.paymentId === receipt.id);
  } finally { Object.assign(console, origLog); }
  const everything = JSON.stringify(await Promise.all(['payments', 'applications', 'events', 'notifications', 'emails'].map((c) => db.find(c))));
  check('Full card numbers and CVCs are never stored', !/4242424242424242|4000000000000002|4000000000009995|4242 4242 4242 4242/.test(everything) && !/"cvc"/.test(everything));
  check('…or logged', !logged.some((l) => /4242424242424242|4000000000000002|4000000000009995|4242424242424241|4111111111111111|"cvc"/.test(l)));

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
  r = await anon('GET', '/api/system/mail-health');
  check('Email health needs a login', r.status === 401);
  r = await staff('GET', '/api/system/mail-health');
  check('Email health is for administrators only', r.status === 403);
  r = await admin('GET', '/api/system/mail-health');
  check('Email health shows provider and today\'s count against the daily limit', r.status === 200 && r.body.provider === 'dev'
    && Number.isInteger(r.body.sentToday) && r.body.dailyLimit === 300 && Array.isArray(r.body.problems));
  r = await admin('GET', '/api/system/status');
  check('System status includes email health and the last 20 emails', r.status === 200 && r.body.mail?.dailyLimit === 300 && r.body.recentEmails.length <= 20);
  r = await admin('GET', '/api/admin/users');
  check('Admin can list users', r.status === 200 && r.body.users.length >= 4);
  r = await admin('GET', '/api/admin/shelters');
  check('Admin can list shelters', r.body.shelters.length === 4);
  r = await admin('POST', '/api/admin/shelters', { name: 'PawPal Adelaide', suburb: 'Norwood', state: 'SA' });
  check('Admin can add a shelter', r.status === 201);
  const shelterId = r.body.shelter.id;
  r = await admin('POST', '/api/admin/users', { name: 'Typo Person', email: 'first,second@gmail.com', role: 'staff', shelterId });
  check('Invites to malformed addresses are refused', r.status === 400);
  const unverifiedEmail = `unverified${Date.now()}@example.com`;
  await client()('POST', '/api/auth/register', { name: 'Not Yet Verified', email: unverifiedEmail, password: 'Paws12345' });
  const unverified = (await admin('GET', `/api/admin/users?q=${encodeURIComponent(unverifiedEmail)}`)).body.users[0];
  r = await admin('POST', `/api/admin/users/${unverified.id}/verification`);
  const verifyMails = (await anon('GET', `/api/dev/emails?to=${encodeURIComponent(unverifiedEmail)}`)).body.emails.filter((m) => m.type === 'verification');
  check('Admin sees unverified accounts and can resend verification', unverified.emailVerified === false && r.status === 200 && verifyMails.length === 2);
  const staffEmail = `staff${Date.now()}@pawpal.com`;
  r = await admin('POST', '/api/admin/users', { name: 'New Staffer', email: staffEmail, role: 'staff', shelterId });
  check('Admin can invite staff', r.status === 201 && r.body.emailSent === true);
  const newStaffId = r.body.user.id;
  r = await admin('POST', `/api/admin/users/${newStaffId}/invite`);
  check('Admin can resend an invite', r.status === 200 && r.body.emailSent === true);
  const inviteMail = (await anon('GET', `/api/dev/emails?to=${encodeURIComponent(staffEmail)}`)).body.emails.find((m) => m.type === 'staff-invite');
  check('Invite email has a set-password link and no password', Boolean(inviteMail?.link?.includes('reset-password.html?token=')) && !/password:/i.test(inviteMail.html));
  r = await anon('POST', '/api/auth/reset-password', { token: new URL(inviteMail.link).searchParams.get('token'), password: 'StaffPaws88' });
  check('Invited staff can choose a password', r.status === 200);
  r = await client()('POST', '/api/auth/login', { email: staffEmail, password: 'StaffPaws88', role: 'staff' });
  check('Invited staff can log in', r.status === 200);
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
  const petsBefore = await db.count('pets');
  const goat = (await db.find('pets')).find((p) => p.breed === 'Pygmy Goat');
  await db.remove('pets', goat.id);
  const shelter = (await db.find('shelters'))[0];
  await db.update('shelters', shelter.id, { email: 'melbourne@pawpal.app' });
  await db.update('meta', 'schema', { version: 2 });
  await migrate();
  check('Upgrade adds missing species without duplicating any', (await db.count('pets')) === petsBefore && (await db.find('pets')).filter((p) => p.breed === 'Pygmy Goat').length === 1);
  check('Upgrade replaces placeholder shelter emails', !/@pawpal\.app$/.test((await db.findOne('shelters', { id: shelter.id })).email));

  console.log('\nMeet & greet booking');
  await adopter('POST', '/api/auth/login', { email, password: 'NewPaws567', role: 'user' }); // password changed by the account-security checks
  const melbourneId = (await db.findOne('users', { email: 'staff@pawpal.com' })).shelterId;
  const openAppPets = new Set((await db.find('applications')).filter((x) => !['Declined', 'Withdrawn', 'Adopted'].includes(x.status)).map((x) => x.petId));
  const bookPets = (await db.find('pets')).filter((x) => x.status === 'Available' && x.shelterId !== melbourneId && !openAppPets.has(x.id));
  const bShelter = bookPets[0].shelterId;
  const [bPet1, bPet2] = bookPets.filter((x) => x.shelterId === bShelter);
  r = await adopter('POST', '/api/applications', { ...form, petId: bPet1.id, declaration: true });
  const bApp = r.body.application.id;
  r = await adopter('POST', '/api/applications', { ...form, petId: bPet2.id, declaration: true });
  const cApp = r.body.application.id;
  const at = (days, hours = 7, mins = 0) => { const d = new Date(Date.now() + days * 86400000); d.setHours(hours, mins, 0, 0); return d.toISOString(); };
  // Test times are Tuesday mornings (07:00): the demo data's meet & greet times are Saturdays 10:00–13:00, so the
  // two can never overlap, whatever day of the week or time zone the tests are run in
  const T = (() => { for (let d = 3; ; d++) if (new Date(Date.now() + d * 86400000).getDay() === 2) return d; })();
  r = await anon('POST', '/api/slots', { windows: [{ start: at(T), end: at(T, 9) }], durationMins: 30 });
  check('Creating times needs a login', r.status === 401);
  r = await adopter('POST', '/api/slots', { windows: [{ start: at(T), end: at(T, 9) }], durationMins: 30 });
  check('Adopters cannot create times', r.status === 403);
  r = await admin('POST', '/api/slots', { shelterId: bShelter, windows: [{ start: at(T), end: at(T, 9) }], durationMins: 25 });
  check('Slot length is validated', r.status === 400);
  r = await admin('POST', '/api/slots', { shelterId: bShelter, windows: [{ start: at(T, 9), end: at(T, 7) }], durationMins: 30 });
  check('End must be after start', r.status === 400);
  r = await admin('POST', '/api/slots', { shelterId: bShelter, windows: [{ start: at(-1), end: at(-1, 9) }], durationMins: 30 });
  check('Times must be in the future', r.status === 400);
  r = await admin('POST', '/api/slots', { windows: [{ start: at(T), end: at(T, 9) }], durationMins: 30 });
  check('Admins must choose a shelter', r.status === 400);
  r = await admin('POST', '/api/slots', { shelterId: bShelter, windows: [{ start: at(T), end: at(T, 9) }, { start: at(T + 7), end: at(T + 7, 8) }], durationMins: 30 });
  check('Repeating times are generated back to back (4 + 2 slots)', r.status === 201 && r.body.created === 6);
  r = await admin('POST', '/api/slots', { shelterId: bShelter, windows: [{ start: at(T), end: at(T, 9) }], durationMins: 30 });
  check('Existing times are not duplicated', r.status === 201 && r.body.created === 0 && r.body.skipped === 4);
  r = await admin('GET', `/api/slots?shelterId=${bShelter}`);
  // Only this test's Tuesday times (the demo data's Saturday times can be less than 24 hours away, which would change what's allowed)
  const bSlots = r.body.slots.filter((x) => !x.bookedBy && new Date(x.start).getDay() === 2).sort((x, y) => new Date(x.start) - new Date(y.start));
  check('Staff see the free times', r.status === 200 && bSlots.length >= 6);
  r = await staff('GET', '/api/slots');
  check('Staff only see their own shelter\'s times', r.status === 200 && r.body.slots.every((x) => x.shelterId === melbourneId));
  r = await adopter('GET', `/api/applications/${bApp}/slots`);
  check('Adopters can\'t book before being invited', r.status === 400);
  r = await staff('POST', `/api/applications/${bApp}/invite-booking`, {});
  check('Staff from another shelter can\'t invite', r.status === 404);
  r = await admin('POST', `/api/applications/${bApp}/invite-booking`, { message: 'Bring your other dog if you can!' });
  check('Staff can invite an applicant to book (in-app + email)', r.status === 200 && r.body.freeSlots >= 6 && /invited/.test(r.body.message)
    && Boolean(await mailFor(anon, email, 'booking')) && (await adopter('GET', '/api/notifications')).body.notifications.some((n) => n.type === 'booking'));
  await admin('POST', `/api/applications/${cApp}/invite-booking`, {});
  r = await adopter('GET', `/api/applications/${bApp}/slots`);
  check('Invited adopters see the free times for that shelter', r.status === 200 && r.body.slots.length >= 6);
  const [race1, race2] = await Promise.all([adopter('POST', `/api/applications/${bApp}/book`, { slotId: bSlots[0].id }),
    adopter('POST', `/api/applications/${cApp}/book`, { slotId: bSlots[0].id })]);
  check('Two bookings for the same time at once: exactly one wins', [race1.status, race2.status].sort().join() === '200,409');
  const winner = race1.status === 200 ? bApp : cApp; const loser = winner === bApp ? cApp : bApp;
  r = await adopter('GET', `/api/applications/${winner}`);
  check('Booking moves the application to Meet & Greet at the slot time', r.body.application.status === 'Meet & Greet'
    && r.body.application.appointmentAt === bSlots[0].start && /Booked by applicant/.test(r.body.application.history.at(-1).note) && r.body.application.booking.canChange);
  check('…and puts the pet on hold', (await db.findOne('pets', { id: winner === bApp ? bPet1.id : bPet2.id })).status === 'On Hold');
  r = await adopter('POST', `/api/applications/${loser}/book`, { slotId: bSlots[0].id });
  check('A booked time can\'t be taken again', r.status === 409);
  r = await adopter('POST', `/api/applications/${winner}/book`, { slotId: bSlots[1].id });
  check('Adopters can reschedule more than 24 hours ahead', r.status === 200 && /Rescheduled by applicant/.test(r.body.application.history.at(-1).note));
  r = await admin('GET', `/api/slots?shelterId=${bShelter}`);
  check('Rescheduling frees the old time', !r.body.slots.find((x) => x.id === bSlots[0].id).bookedBy && r.body.slots.find((x) => x.id === bSlots[1].id).bookedBy === winner);
  r = await admin('DELETE', `/api/slots/${bSlots[1].id}`);
  check('Booked times can\'t be deleted', r.status === 409);
  r = await admin('DELETE', `/api/slots/${bSlots[5].id}`);
  check('Free times can be deleted', r.status === 200);
  r = await adopter('POST', `/api/applications/${winner}/cancel-booking`);
  check('Adopters can cancel more than 24 hours ahead (application stays open)', r.status === 200 && r.body.application.status === 'Submitted' && !r.body.application.appointmentAt);
  r = await admin('GET', `/api/slots?shelterId=${bShelter}`);
  check('Cancelling frees the time', !r.body.slots.find((x) => x.id === bSlots[1].id).bookedBy);
  const soon = new Date(Date.now() + 3 * 3600000); soon.setMinutes(0, 0, 0);
  await admin('POST', '/api/slots', { shelterId: bShelter, windows: [{ start: soon.toISOString(), end: new Date(soon.getTime() + 30 * 60000).toISOString() }], durationMins: 30 });
  const soonSlot = (await admin('GET', `/api/slots?shelterId=${bShelter}`)).body.slots.find((x) => x.start === soon.toISOString());
  r = await adopter('POST', `/api/applications/${winner}/book`, { slotId: soonSlot.id });
  check('A time a few hours away can be booked', r.status === 200);
  r = await adopter('POST', `/api/applications/${winner}/cancel-booking`);
  check('…but not cancelled online within 24 hours', r.status === 400 && /24 hours/.test(r.body.error));
  r = await adopter('POST', `/api/applications/${winner}/book`, { slotId: bSlots[2].id });
  check('…or moved within 24 hours', r.status === 400);
  await adopter('POST', `/api/applications/${winner}/withdraw`);
  await adopter('POST', `/api/applications/${loser}/withdraw`);
  r = await admin('GET', `/api/slots?shelterId=${bShelter}`);
  check('Withdrawing frees the booked time', !r.body.slots.find((x) => x.id === soonSlot.id).bookedBy);
  r = await anon('GET', '/availability.html');
  check('Availability page is for staff only', r.status === 302);

  console.log('\nPrintable flyers');
  r = await anon('GET', '/flyer.html');
  check('Flyer page is for staff only (visitors are sent to log in)', r.status === 302 && /login\.html\?role=staff/.test(r.headers.get('location')));
  r = await adopter('GET', '/flyer.html');
  check('Adopters cannot open the flyer page', r.status === 302);
  const flyerPet = (await db.find('pets')).find((x) => x.medicalHistory && x.status === 'Available');
  r = await admin('GET', `/api/pets/${flyerPet.id}?public=1`);
  check('Flyers get only public pet fields, even for staff', r.status === 200 && r.body.pet.name === flyerPet.name
    && !('medicalHistory' in r.body.pet) && !('rescueBackground' in r.body.pet) && !('internalNotes' in r.body.pet) && r.body.shelter?.name);
  r = await admin('GET', `/api/pets/${flyerPet.id}`);
  check('The normal staff view still includes internal fields', 'medicalHistory' in r.body.pet);

  console.log('\nSocial post maker');
  const promoPet = (await db.find('pets')).find((x) => x.status === 'Available' && x.shelterId === melbourneId && x.medicalHistory);
  const otherShelterPet = (await db.find('pets')).find((x) => x.status === 'Available' && x.shelterId !== melbourneId);
  r = await anon('POST', '/api/ai/promote', { petId: promoPet.id, platform: 'instagram', tone: 'friendly' });
  check('Post maker needs a login', r.status === 401);
  r = await adopter('POST', '/api/ai/promote', { petId: promoPet.id, platform: 'instagram', tone: 'friendly' });
  check('Post maker is for staff only', r.status === 403);
  r = await staff('POST', '/api/ai/promote', { petId: promoPet.id, platform: 'tiktok', tone: 'friendly' });
  check('Platform is validated', r.status === 400);
  r = await staff('POST', '/api/ai/promote', { petId: promoPet.id, platform: 'instagram', tone: 'angry' });
  check('Tone is validated', r.status === 400);
  r = await staff('POST', '/api/ai/promote', { petId: otherShelterPet.id, platform: 'instagram', tone: 'friendly' });
  check('Staff can only promote their own shelter\'s pets', r.status === 404);
  const adoptedPet = (await db.find('pets')).find((x) => x.status === 'Adopted');
  r = await admin('POST', '/api/ai/promote', { petId: adoptedPet.id, platform: 'facebook', tone: 'friendly' });
  check('Adopted pets can\'t be promoted', r.status === 400);
  for (const [platform, tone] of [['instagram', 'playful'], ['facebook', 'heartfelt']]) {
    r = await staff('POST', '/api/ai/promote', { petId: promoPet.id, platform, tone });
    check(`Caption + hashtags for ${platform} (${tone}) from public facts only`, r.status === 200 && r.body.caption.includes(promoPet.name)
      && r.body.hashtags.length >= 3 && r.body.hashtags.every((h) => /^[A-Za-z0-9_]+$/.test(h)) && /\/p\/pet_/.test(r.body.link)
      && !r.body.caption.includes(promoPet.medicalHistory.slice(0, 20)) && (platform === 'facebook' ? r.body.caption.includes(r.body.link) : /link in our bio/i.test(r.body.caption)));
  }
  r = await anon('GET', `/p/${promoPet.id}`);
  check('Short profile links redirect to the pet profile', r.status === 302 && r.headers.get('location') === `/pet-profile.html?id=${promoPet.id}`);

  console.log('\nCompare pets');
  const listed = (await db.find('pets')).filter((x) => ['Available', 'On Hold'].includes(x.status));
  const [c1, c2, c3, c4] = listed;
  r = await anon('POST', '/api/ai/compare', { ids: [c1.id] });
  check('Compare needs at least 2 pets', r.status === 400);
  r = await anon('POST', '/api/ai/compare', { ids: [c1.id, c2.id, c3.id, c4.id] });
  check('Compare rejects more than 3 pets', r.status === 400 && /up to 3/.test(r.body.error));
  r = await anon('POST', '/api/ai/compare', { ids: 'abc' });
  check('Compare validates the ids', r.status === 400);
  r = await anon('POST', '/api/ai/compare', { ids: [c1.id, 'pet_doesnotexist'] });
  check('Compare rejects unknown pets', r.status === 404);
  r = await anon('POST', '/api/ai/compare', { ids: [c1.id, adoptedPet.id] });
  check('Compare rejects pets that are not public', r.status === 404);
  r = await anon('POST', '/api/ai/compare', { ids: [c1.id, c2.id, c3.id] });
  const leaks = ['medicalHistory', 'rescueBackground', 'internalNotes', 'createdBy'];
  check('Visitors can compare 3 pets (public fields only, rules explanation, no scores)', r.status === 200 && r.body.pets.length === 3
    && r.body.pets.every((x) => leaks.every((k) => !(k in x))) && r.body.scores === null && r.body.summary.length > 20
    && r.body.highlights.length === 3 && r.body.source === 'rules', JSON.stringify(r.body).slice(0, 300));
  r = await adopter('POST', '/api/ai/compare', { ids: [c1.id, c2.id] });
  check('Adopters with a saved lifestyle get a match score per pet', r.status === 200 && r.body.hasProfile
    && [c1.id, c2.id].every((id) => Number.isInteger(r.body.scores[id].score)) && /\d+%/.test(r.body.summary), JSON.stringify(r.body).slice(0, 300));

  console.log('\nAdoption categories, rescue page and vet ranking');
  const allPublic = (await anon('GET', '/api/pets')).body.pets;
  check('Every public pet has an adoption category', allPublic.every((x) => ['rescue', 'domestic', 'exotic', 'rare'].includes(x.category)));
  for (const kind of ['rescue', 'domestic', 'exotic', 'rare']) {
    r = await anon('GET', `/api/pets?category=${kind}`);
    check(`Browse by category: ${kind}`, r.status === 200 && r.body.total >= 3 && r.body.pets.every((x) => x.category === kind), `${r.body.total}`);
  }
  r = await anon('GET', '/api/pets?category=nonsense');
  check('An unknown category is ignored', r.body.total === allPublic.length);
  r = await anon('GET', '/api/pets?category=rescue&type=dog');
  check('Category and species filters combine', r.body.pets.length >= 2 && r.body.pets.every((x) => x.category === 'rescue' && x.type === 'Dog'));
  check('New rescue, exotic and rare animals are listed', ['Hope', 'Bramble', 'Rio', 'Axel', 'Saffron', 'Pippin'].every((n) => allPublic.some((x) => x.name === n)));
  r = await staff('POST', '/api/pets', { name: 'Kiki', type: 'Bird', breed: 'Rainbow Lorikeet', category: 'rescue', status: 'Draft' });
  check('Staff can set a pet\'s category', r.status === 201 && r.body.pet.category === 'rescue');
  r = await staff('POST', '/api/pets', { name: 'Gus', type: 'Farm Animal', breed: 'Pig', category: 'bogus', status: 'Draft' });
  check('An invalid category falls back to the species default', r.status === 201 && r.body.pet.category === 'rare');
  r = await staff('POST', '/api/pets', { name: 'Tiny', type: 'Hamster', breed: 'Dwarf', status: 'Draft' });
  check('New pets get a category from their species', r.status === 201 && r.body.pet.category === 'domestic');
  r = await anon('GET', '/rescue.html');
  check('Rescue animals page is public', r.status === 200);
  {
    // An existing database (schema v4) gets categories and the new animals, without duplicates
    const { migrate } = require('../src/services/migrate');
    const old = (await db.find('pets')).find((x) => x.type === 'Reptile');
    await db.update('pets', old.id, { category: null });
    check('(test setup) the pet really has no category', (await db.findOne('pets', { id: old.id })).category === null);
    const hope = (await db.find('pets')).find((x) => x.name === 'Hope');
    await db.remove('pets', hope.id);
    await db.update('meta', 'schema', { version: 4 });
    const before = (await db.find('pets')).length;
    await migrate();
    const after = await db.find('pets');
    check('Migration v5 gives existing pets a category', after.find((x) => x.id === old.id).category === 'exotic');
    check('Migration v5 adds missing category animals once', after.length === before + 1 && after.filter((x) => x.name === 'Hope').length === 1 && after.find((x) => x.name === 'Hope').category === 'rescue');
  }
  {
    const { topRated } = require('../src/services/maps');
    const ranked = topRated([{ id: 'a', rating: 4.9, reviews: 8 }, { id: 'b', rating: 4.8, reviews: 600 }, { id: 'c', rating: null, reviews: 0 }, { id: 'd', rating: 4.2, reviews: 300 },
      { id: 'e', rating: 4.6, reviews: 120 }, { id: 'f', rating: 3.9, reviews: 50 }, { id: 'g', rating: 4.4, reviews: 90 }]);
    check('Top vets: 5 rated clinics, weighted by number of reviews', ranked.length === 5 && ranked[0].id === 'b' && ranked.every((v) => v.rating) && !ranked.some((v) => v.id === 'f'));
  }
  r = await anon('GET', '/api/vets?q=Footscray');
  check('Vet search without a Maps key returns no made-up ratings', r.status === 200 && r.body.enabled === false && r.body.top.length === 0);

  console.log('\nTranslation');
  const trPet = (await db.find('pets')).find((x) => x.status === 'Available' && x.medicalHistory && x.traits?.length && x.description);
  r = await anon('POST', '/api/ai/translate', { petId: trPet.id, lang: 'fr' });
  check('Translate validates the language', r.status === 400);
  r = await anon('POST', '/api/ai/translate', { lang: 'es' });
  check('Translate needs a pet or text', r.status === 400);
  r = await anon('POST', '/api/ai/translate', { petId: 'pet_nope', lang: 'es' });
  check('Translate rejects unknown pets', r.status === 404);
  r = await anon('POST', '/api/ai/translate', { texts: Array(11).fill('hello'), lang: 'es' });
  check('Translate limits how much text is sent', r.status === 400);
  r = await anon('POST', '/api/ai/translate', { petId: trPet.id, lang: 'es' });
  check('Without an AI key the profile stays in English with a notice', r.status === 200 && r.body.translated === false && /English/.test(r.body.notice)
    && r.body.fields.description === trPet.description);
  // Simulate a language model to check caching and validation
  const llm = require('../src/services/llm');
  const realLlm = { llmEnabled: llm.llmEnabled, provider: llm.provider, complete: llm.complete };
  const prompts = [];
  let reply = null;
  Object.assign(llm, { llmEnabled: true, provider: 'gemini', complete: async ({ messages }) => { prompts.push(messages[0].content); return typeof reply === 'function' ? reply(JSON.parse(messages[0].content)) : reply; } });
  try {
    reply = (f) => ({ description: `ES: ${f.description}`, idealHome: f.idealHome ? `ES: ${f.idealHome}` : '', traits: f.traits.map((t) => `es-${t}`) });
    r = await anon('POST', '/api/ai/translate', { petId: trPet.id, lang: 'es' });
    check('Pet profile is machine translated and labelled', r.status === 200 && r.body.translated && r.body.label === 'Machine translated'
      && r.body.fields.description.startsWith('ES: ') && r.body.fields.traits.length === trPet.traits.length && r.body.cached === false, JSON.stringify([r.status, r.body]).slice(0, 300));
    check('Only public fields are sent for translation', prompts.length === 1 && !prompts[0].includes(trPet.medicalHistory.slice(0, 20))
      && Object.keys(JSON.parse(prompts[0])).sort().join() === 'description,idealHome,traits');
    r = await anon('POST', '/api/ai/translate', { petId: trPet.id, lang: 'es' });
    check('Each text is translated once (served from the cache)', r.body.translated && r.body.cached === true && prompts.length === 1);
    check('Translations are stored by pet, language and content hash', (await db.find('translations', { petId: trPet.id })).some((t) => t.lang === 'es' && /^[0-9a-f]{64}$/.test(t.hash)));
    reply = (f) => ({ description: 'x', idealHome: '', traits: ['only one'] });
    r = await anon('POST', '/api/ai/translate', { petId: trPet.id, lang: 'hi' });
    check('Invalid AI output is rejected and the page stays in English', r.status === 200 && r.body.translated === false && r.body.fields.description === trPet.description);
    reply = () => { throw new Error('model down'); };
    r = await anon('POST', '/api/ai/translate', { petId: trPet.id, lang: 'ne' });
    check('AI errors fall back to English instead of failing', r.status === 200 && r.body.translated === false && r.body.notice);
    reply = (b) => ({ translations: b.texts.map((t) => `中文 ${t}`) });
    r = await anon('POST', '/api/ai/translate', { texts: ['Hello there', 'What happens after I apply?'], lang: 'zh' });
    check('Chat replies are translated in one batch', r.status === 200 && r.body.translated && r.body.texts[1] === '中文 What happens after I apply?');
    const before = prompts.length;
    r = await anon('POST', '/api/ai/translate', { texts: ['Hello there', 'A new reply'], lang: 'zh' });
    check('…and only uncached replies are sent again', r.body.translated && prompts.length === before + 1 && JSON.parse(prompts.at(-1)).texts.length === 1
      && r.body.texts[0] === '中文 Hello there');
  } finally { Object.assign(llm, realLlm); }
  let limited = null;
  for (let i = 0; i < 70 && !limited; i++) {
    const t = await anon('POST', '/api/ai/translate', { texts: ['hi'], lang: 'en' });
    if (t.status === 429) limited = t;
  }
  check('Translation is rate limited', limited && /translations/.test(limited.body.error));

  console.log('\nTwo-factor authentication (staff)');
  const totp = require('../src/services/totp');
  r = await anon('GET', '/api/auth/2fa/status');
  check('2FA status needs a login', r.status === 401);
  r = await adopter('POST', '/api/auth/2fa/setup');
  check('Adopters cannot turn on 2FA', r.status === 403, JSON.stringify([r.status, r.body]));
  r = await staff('POST', '/api/auth/login', { email: 'staff@pawpal.com', password: 'Staff@123', role: 'staff' });
  r = await staff('POST', '/api/auth/2fa/setup');
  check('Staff can start 2FA setup (secret + otpauth link for the QR code)', r.status === 200 && /^[A-Z2-7]{32}$/.test(r.body.secret) && /^otpauth:\/\/totp\/PawPal%3Astaff%40pawpal\.com\?secret=/.test(r.body.otpauthUrl));
  const tfSecret = r.body.secret;
  r = await staff('POST', '/api/auth/2fa/enable', { code: '000000' });
  check('A wrong code does not turn 2FA on', r.status === 400);
  r = await staff('POST', '/api/auth/2fa/enable', { code: totp.totp(tfSecret) });
  const backupCodes = r.body.backupCodes || [];
  check('Confirming with a code turns 2FA on and shows 8 backup codes once', r.status === 200 && backupCodes.length === 8 && backupCodes.every((c) => /^[0-9a-f]{5}-[0-9a-f]{5}$/.test(c)));
  const storedUser = await db.findOne('users', { email: 'staff@pawpal.com' });
  check('The secret is stored encrypted and backup codes only as hashes', /^v1:/.test(storedUser.twoFactor.secret) && !JSON.stringify(storedUser).includes(tfSecret)
    && storedUser.twoFactor.backupCodes.every((h) => /^\$2[aby]\$/.test(h)));
  r = await staff('GET', '/api/auth/2fa/status');
  check('2FA status never returns the secret', r.status === 200 && r.body.enabled === true && r.body.backupCodesLeft === 8 && !JSON.stringify(r.body).includes(tfSecret));
  const tfLogin = client();
  r = await tfLogin('POST', '/api/auth/login', { email: 'staff@pawpal.com', password: 'Staff@123', role: 'staff' });
  check('Password alone only asks for the code (no login cookie)', r.status === 200 && r.body.twoFactorRequired === true && !r.body.user
    && /pawpal_2fa=/.test(r.headers.get('set-cookie') || '') && !/pawpal_token=[^;]/.test(r.headers.get('set-cookie') || ''));
  r = await tfLogin('GET', '/api/auth/me');
  check('Not logged in until the code is entered', r.body.user === null);
  r = await tfLogin('POST', '/api/auth/2fa/verify', { code: '123456' });
  check('A wrong code is rejected', r.status === 400);
  r = await client()('POST', '/api/auth/2fa/verify', { code: totp.totp(tfSecret) });
  check('A code without the pending sign-in is rejected', r.status === 401);
  r = await tfLogin('POST', '/api/auth/2fa/verify', { code: totp.totp(tfSecret, Date.now() + 30000) });
  check('The right code finishes the login', r.status === 200 && r.body.user?.email === 'staff@pawpal.com' && r.body.redirect === 'index.html');
  r = await tfLogin('GET', '/api/applications');
  check('…and the staff portal works', r.status === 200, JSON.stringify([r.status, r.body]).slice(0, 200));
  const tfBackup = client();
  await tfBackup('POST', '/api/auth/login', { email: 'staff@pawpal.com', password: 'Staff@123', role: 'staff' });
  r = await tfBackup('POST', '/api/auth/2fa/verify', { code: backupCodes[0].toUpperCase() });
  check('A backup code works instead of the app code', r.status === 200 && r.body.user?.email === 'staff@pawpal.com');
  const tfReuse = client();
  await tfReuse('POST', '/api/auth/login', { email: 'staff@pawpal.com', password: 'Staff@123', role: 'staff' });
  r = await tfReuse('POST', '/api/auth/2fa/verify', { code: backupCodes[0] });
  check('Each backup code works only once', r.status === 400);
  r = await staff('GET', '/api/auth/2fa/status');
  check('Used backup codes are counted', r.body.backupCodesLeft === 7);

  r = await staff('PUT', '/api/admin/settings', { requireStaff2fa: true });
  check('Only administrators can require 2FA', r.status === 403);
  r = await admin('PUT', '/api/admin/settings', { requireStaff2fa: 'yes' });
  check('Require-2FA setting is validated', r.status === 400);
  r = await admin('PUT', '/api/admin/settings', { requireStaff2fa: true });
  check('An admin without 2FA cannot require it (would lock themselves out)', r.status === 400);
  r = await admin('POST', '/api/auth/2fa/setup');
  const adminSecret = r.body.secret;
  await admin('POST', '/api/auth/2fa/enable', { code: totp.totp(adminSecret) });
  r = await admin('PUT', '/api/admin/settings', { requireStaff2fa: true });
  check('Admin can require 2FA for staff', r.status === 200 && r.body.settings.requireStaff2fa === true);
  const noTf = client();
  r = await noTf('POST', '/api/auth/login', { email: staffEmail, password: 'StaffPaws88', role: 'staff' });
  check('Staff without 2FA are sent to set it up', r.status === 200 && r.body.twoFactorSetupRequired === true && r.body.redirect === 'settings.html#twofactor');
  r = await noTf('GET', '/api/applications');
  check('…and can\'t use the portal until they do', r.status === 403 && r.body.code === 'TWO_FACTOR_SETUP_REQUIRED');
  r = await noTf('GET', '/api/auth/2fa/status');
  check('…but can still reach the 2FA setup', r.status === 200 && r.body.required === true && r.body.enabled === false);
  r = await staff('POST', '/api/auth/2fa/disable', { password: 'Staff@123', code: totp.totp(tfSecret, Date.now() + 30000) });
  check('2FA cannot be turned off while it is required', r.status === 403);
  r = await adopter('GET', '/api/applications/mine');
  check('Adopters are not affected by the staff requirement', r.status === 200, JSON.stringify([r.status, r.body]).slice(0, 200));
  r = await admin('PUT', '/api/admin/settings', { requireStaff2fa: false });
  check('Admin can make 2FA optional again', r.status === 200 && r.body.settings.requireStaff2fa === false);

  const staffId = (await db.findOne('users', { email: 'staff@pawpal.com' })).id;
  r = await staff('POST', '/api/auth/2fa/disable', { password: 'wrong-password1', code: totp.totp(tfSecret, Date.now() + 30000) });
  check('Turning 2FA off needs the password', r.status === 400);
  r = await staff('POST', `/api/admin/users/${staffId}/2fa/reset`);
  check('Only administrators can reset someone\'s 2FA', r.status === 403);
  r = await admin('POST', `/api/admin/users/${staffId}/2fa/reset`);
  check('Admin can reset a staff member\'s 2FA (lost phone)', r.status === 200);
  r = await staff('GET', '/api/auth/me');
  check('Reset signs them out everywhere', r.body.user === null);
  r = await staff('POST', '/api/auth/login', { email: 'staff@pawpal.com', password: 'Staff@123', role: 'staff' });
  check('After a reset they sign in with just their password', r.status === 200 && !r.body.twoFactorRequired && r.body.user.twoFactorEnabled === false);
  r = await admin('POST', '/api/auth/2fa/disable', { password: 'Admin@123', code: totp.totp(adminSecret, Date.now() + 30000) });
  check('Password + current code turns 2FA off', r.status === 200 && r.body.enabled === false);

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
