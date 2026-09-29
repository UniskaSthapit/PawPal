// npm run test:ui — real-browser journeys through the UI (Playwright + Chromium).
// Starts PawPal on a spare port with a throwaway database, then clicks through the visitor, adopter,
// shelter-staff and admin journeys. Needs Playwright: `npm i -D playwright && npx playwright install chromium`.
const path = require('path');
const os = require('os');
const fs = require('fs');

const dataFile = path.join(os.tmpdir(), `pawpal-ui-${Date.now()}.json`);
Object.assign(process.env, { PAWPAL_DATA_FILE: dataFile, SMTP_HOST: '', RESEND_API_KEY: '', MONGODB_URI: '', OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '', GOOGLE_MAPS_API_KEY: '', TWILIO_ACCOUNT_SID: '', NODE_ENV: 'test' });

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  try { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }
  catch { console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(1); }
}
const { app } = require('../server');
const db = require('../src/db');
const { seedIfEmpty } = require('../src/services/seed');
let BASE;
let pass = 0; const fails = [];
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fails.push(name); console.log('  ❌ ' + name); } };
(async () => {
  await db.init(); await seedIfEmpty({ force: true });
  const server = app.listen(0); BASE = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const mk = async (w = 1280) => { const c = await browser.newContext({ viewport: { width: w, height: 900 } }); await c.route(/images\.unsplash\.com|google\.com/, (r) => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' })); return c; };
  const errors = [];
  const watch = (p) => p.on('pageerror', (e) => errors.push(e.message));

  console.log('Visitor');
  let ctx = await mk(); let p = await ctx.newPage(); watch(p);
  await p.goto(BASE + 'home.html'); await p.waitForSelector('#featured .pet-card');
  ok('Home shows featured pets from the database', (await p.$$('#featured .pet-card')).length >= 4);
  ok('Live stats rendered', /\d/.test(await p.textContent('#stats')));
  ok('Live matching example rendered', (await p.$$('#demoResults .ai-demo-result')).length === 2);
  await p.click('#heroNext'); ok('Hero slideshow advances', await p.getAttribute('.hero-slide:nth-child(2)', 'class').then((c) => c.includes('is-active')));
  await p.click('#tabAI'); await p.fill('#qsText', 'calm dog for my apartment'); await p.press('#qsText', 'Enter');
  await p.waitForSelector('#nlResult:not([hidden])'); await p.waitForSelector('#grid .pet-card');
  ok('Natural-language search shows interpretation + results', /calm/i.test(await p.textContent('#nlResult')));
  await p.goto(BASE + 'adopt.html'); await p.waitForSelector('#grid .pet-card');
  await p.click('[data-f="type"][data-v="cat"]'); await p.waitForTimeout(400);
  ok('Species filter chip filters to cats and updates the URL', p.url().includes('type=cat') && /pet/.test(await p.textContent('#resultCount')));
  await p.goto(BASE + 'ai-matching.html'); await p.fill('#about', 'I work 9 to 5, live in an apartment, never owned a dog and want a friendly dog that does not need loads of exercise');
  await p.click('#matchBtn'); await p.waitForSelector('.match-card');
  ok('Find My PawPal returns explained matches', (await p.$$('.match-card')).length >= 3 && /Why/.test(await p.textContent('.match-card')));
  await p.click('.chat-launcher'); await p.click('[data-suggest="What happens after I apply?"]');
  await p.waitForFunction(() => document.querySelectorAll('.chat-body .msg-meta').length >= 1, null, { timeout: 15000 });
  ok('Chat assistant answers a process question', /Under Review/.test(await p.textContent('.chat-body')));
  await p.fill('#chatInput', 'Which dogs would suit apartment living?'); await p.press('#chatInput', 'Enter');
  await p.waitForFunction(() => document.querySelectorAll('.chat-body .msg-meta').length >= 2, null, { timeout: 15000 });
  ok('Chat assistant returns real pet cards with links', (await p.getAttribute('.chat-body .mini-pet', 'href')).startsWith('pet-profile.html?id=pet_'));
  await ctx.close();

  console.log('Adopter sign-up → verify → apply');
  ctx = await mk(); p = await ctx.newPage(); watch(p);
  const email = `journey${Date.now()}@example.com`;
  await p.goto(BASE + 'login.html?mode=signup');
  await p.fill('#sName', 'Journey Tester'); await p.fill('#sEmail', email); await p.fill('#sPassword', 'Paws12345'); await p.check('#sTerms');
  await p.click('#signupBtn'); await p.waitForSelector('#sentPanel:not([hidden])');
  ok('Sign-up shows "check your inbox"', true);
  const mail = (await (await fetch(BASE + 'api/dev/emails?to=' + encodeURIComponent(email))).json()).emails.find((m) => m.type === 'verification');
  await p.goto(mail.link.replace(/^https?:\/\/[^/]+\//, BASE)); await p.waitForSelector('text=Your email is verified');
  ok('Verification link verifies the account', true);
  await p.click('text=Log in'); await p.fill('#lEmail', email); await p.fill('#lPassword', 'Paws12345'); await p.click('#loginBtn');
  await p.waitForURL(/dashboard\.html/); await p.waitForSelector('#kpis .kpi');
  ok('Login lands on the adopter dashboard', true);
  await p.goto(BASE + 'adopt.html'); await p.waitForSelector('#grid .fav-btn');
  const favId = await p.getAttribute('#grid .fav-btn', 'data-fav'); await p.click('#grid .fav-btn'); await p.waitForTimeout(500);
  const favs = await p.evaluate(() => PawPalAPI.get('/favourites'));
  ok('Heart saves a favourite to the database', favs.ids.includes(favId));
  const pets = (await (await fetch(BASE + 'api/pets?available=1&type=cat')).json()).pets;
  await p.goto(BASE + `pet-profile.html?id=${pets[0].id}`); await p.waitForSelector('.profile-name');
  await p.click('text=Apply to adopt'); await p.waitForURL(/inquiry-form/); await p.waitForSelector('#nextBtn');
  await p.click('#nextBtn');
  await p.check('input[name=livingType][value="Apartment"]'); await p.check('input[name=ownership][value="Rent"]'); await p.check('input[name=landlordPermission][value="true"]');
  await p.selectOption('#householdAdults', '2'); await p.check('input[name=hasChildren][value="false"]'); await p.check('input[name=hasOtherPets][value="false"]');
  await p.click('[data-help="hoursAlone"]').catch(() => {});
  await p.click('#nextBtn');
  await p.click('[data-help="hoursAlone"]'); await p.waitForSelector('[data-slot="hoursAlone"] .ai-panel');
  ok('Application assistant explains a question', /alone/i.test(await p.textContent('[data-slot="hoursAlone"]')));
  await p.check('input[name=activityLevel][value="1"]'); await p.selectOption('#hoursAlone', '4'); await p.check('input[name=experience][value="Some experience"]');
  await p.click('#nextBtn'); await p.fill('#motivation', 'I work from home most days and would love a calm companion for quiet evenings.');
  await p.click('#nextBtn'); await p.check('#declaration'); await p.click('#submitBtn');
  await p.waitForSelector('text=Application sent!');
  ok('Five-step application submits', true);
  await p.click('text=View my timeline'); await p.waitForSelector('.timeline .tl-item.current');
  ok('Timeline shows the current step', /Submitted/.test(await p.textContent('.timeline')));
  await p.goto(BASE + 'profile.html'); await p.fill('#phoneNum', '0412 999 888'); await p.click('#sendCodeBtn'); await p.waitForSelector('#codeForm:not([hidden])');
  const sms = (await (await fetch(BASE + 'api/dev/sms')).json()).messages.find((m) => m.to === '+61412999888');
  await p.fill('#otp', sms.body.match(/\d{6}/)[0]); await p.waitForSelector('#phoneBadge >> text=Verified');
  ok('Phone verification by SMS code works in the UI', true);
  await ctx.close();

  console.log('Shelter staff');
  ctx = await mk(); p = await ctx.newPage(); watch(p);
  await p.goto(BASE + 'login.html?role=staff'); await p.fill('#lEmail', 'admin@pawpal.com'); await p.fill('#lPassword', 'Admin@123'); await p.click('#loginBtn');
  await p.waitForURL(/index\.html/); await p.waitForSelector('#kpis .kpi');
  ok('Staff login lands on the shelter overview', true);
  await p.goto(BASE + 'applications.html?status=Submitted'); await p.waitForSelector('.app-row');
  await p.click(`.app-row:has-text("Journey Tester")`); await p.waitForSelector('#sumBtn');
  await p.click('#sumBtn'); await p.waitForSelector('#sumBody .ai-panel');
  ok('AI application summary renders', /Journey Tester applied/.test(await p.textContent('#sumBody')));
  await p.selectOption('#newStatus', 'Meet & Greet'); await p.fill('#apptAt', '2026-12-01T10:30'); await p.fill('#statusMsg', 'Come and meet her on Tuesday!');
  await p.click('#statusBtn'); await p.waitForSelector('.toast >> text=Status updated');
  ok('Staff schedule a meet & greet from the pipeline', true);
  await p.goto(BASE + 'add-pet.html'); await p.fill('#name', 'Journey'); await p.fill('#breed', 'Staffy Cross'); await p.fill('#traits', 'Loyal, Playful');
  await p.click('#aiBtn'); await p.waitForFunction(() => document.querySelector('#description').value.includes('Journey'));
  ok('Generate with AI fills the description', true);
  await p.click('#publishBtn'); await p.waitForURL(/pets\.html/); await p.waitForSelector('td >> text=Journey');
  ok('Published pet appears in the pets list', true);
  await p.goto(BASE + 'assistant.html'); await p.click('#asstSuggest >> text=Which pets have received no enquiries?');
  await p.waitForFunction(() => document.querySelectorAll('#asstBody .msg-bot').length >= 2 && !document.querySelector('.typing'));
  ok('Shelter assistant answers from data', /enquir/i.test(await p.textContent('#asstBody')));
  await p.goto(BASE + 'analytics.html'); await p.waitForSelector('#funnel .funnel-row'); await p.waitForSelector('#insights .insight');
  ok('Analytics renders funnel and insights', true);
  await p.goto(BASE + 'admin.html'); await p.waitForSelector('#users tr');
  ok('Admin sees users and shelters', (await p.$$('#users tr')).length >= 4 && (await p.$$('#shelters .card')).length === 4);
  await ctx.close();

  console.log('Adopter sees the update');
  ctx = await mk(390); p = await ctx.newPage(); watch(p);
  await p.goto(BASE + 'login.html'); await p.fill('#lEmail', email); await p.fill('#lPassword', 'Paws12345'); await p.click('#loginBtn'); await p.waitForURL(/dashboard/);
  await p.waitForSelector('#nudges .alert-info');
  ok('Dashboard shows the upcoming meet & greet', /Meet & Greet/.test(await p.textContent('#nudges')));
  await p.click('#bellBtn'); await p.waitForSelector('#bellList .notif-item');
  ok('Notification bell lists the status change', /Meet & Greet/.test(await p.textContent('#bellList')));
  await ctx.close();

  ok('No uncaught JavaScript errors during journeys', errors.length === 0);
  if (errors.length) console.log(errors);
  console.log(`\n${fails.length ? '❌' : '✅'} ${pass} passed, ${fails.length} failed`);
  await browser.close();
  server.close(); await db.flush(); fs.rmSync(dataFile, { force: true });
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('JOURNEY CRASH:', e.message); process.exit(1); });
