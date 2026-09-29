// ============================================================
// PawPal server — Node.js + Express
// Serves the website (public/) and the REST API (/api/*).
// ============================================================
// Some hosts (Render's free plan included) advertise IPv6 but can't actually
// route it, so anything that connects out — like sending email via Gmail —
// fails with ENETUNREACH/timeout unless Node is 
// told to prefer IPv4 addresses
// when it resolves a hostname. This must run before anything else connects out.
require('dns').setDefaultResultOrder('ipv4first');

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const config = require('./src/config');
const db = require('./src/db');
const { seedIfEmpty } = require('./src/services/seed');
const { migrate } = require('./src/services/migrate');
const { loadUser, isStaffRole } = require('./src/middleware/auth');
const llm = require('./src/services/llm');
const { emailMode } = require('./src/services/mailer');
const { smsMode } = require('./src/services/sms');

const app = express();
app.set('trust proxy', 1); // correct client IPs behind Render/Railway proxies (rate limiting)

// Security headers. CSP is off because the pages use inline event handlers.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use((req, res, next) => (config.isProd && req.headers['x-forwarded-proto'] === 'http' ? res.redirect(301, `https://${req.headers.host}${req.originalUrl}`) : next())); // HTTPS in production only
app.use(compression());
app.use(express.json({ limit: '15mb' })); // pet photos are sent as compressed images
app.use(cookieParser());
app.use(loadUser);

// ---------- API ----------
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/pets', require('./src/routes/pets'));
app.use('/api/images', require('./src/routes/images'));
app.use('/api/applications', require('./src/routes/applications'));
app.use('/api/favourites', require('./src/routes/favourites'));
app.use('/api/enquiries', require('./src/routes/enquiries'));
app.use('/api/ai', require('./src/routes/ai'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api', require('./src/routes/misc'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- Page protection (server-side, so protected pages never flash) ----------
const STAFF_PAGES = ['index.html', 'pets.html', 'add-pet.html', 'applications.html', 'analytics.html', 'settings.html', 'enquiries.html', 'assistant.html'];
const ADMIN_PAGES = ['admin.html'];
const ADOPTER_PAGES = ['dashboard.html', 'my-applications.html', 'inquiry-form.html'];
const ACCOUNT_PAGES = ['profile.html', 'notifications.html'];
app.get('/', (req, res) => res.redirect('/home.html'));
app.get(/^\/([a-z-]+\.html)$/, (req, res, next) => {
  const page = req.params[0];
  const next_ = encodeURIComponent(req.originalUrl.slice(1));
  const role = req.user?.role;
  if ((STAFF_PAGES.includes(page) || ADMIN_PAGES.includes(page)) && !isStaffRole(role)) return res.redirect(`/login.html?role=staff&next=${next_}`);
  if (ADMIN_PAGES.includes(page) && role !== 'admin') return res.redirect('/index.html');
  if (ADOPTER_PAGES.includes(page) || ACCOUNT_PAGES.includes(page)) {
    if (!req.user) return res.redirect(`/login.html?next=${next_}`);
    if (ADOPTER_PAGES.includes(page) && isStaffRole(role)) return res.redirect('/index.html');
  }
  if (page === 'dev-mailbox.html' && (config.isProd || (emailMode !== 'dev' && smsMode !== 'dev'))) return res.redirect('/home.html');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: config.isProd ? '1h' : 0 }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

// ---------- Errors ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large. Try fewer or smaller photos.' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message });
});

async function start() {
  await db.init();
  const seeded = await seedIfEmpty();
  const migrated = seeded ? false : await migrate();
  app.listen(config.port, () => {
    console.log(`\n🐾 PawPal is running at ${config.appUrl}`);
    console.log(`   Database: ${db.name}${seeded ? ' (demo data loaded)' : migrated ? ' (data upgraded to the latest schema)' : ''}`);
    console.log(`   Email:    ${{ resend: 'Resend API', smtp: 'SMTP ' + config.smtp.host, dev: 'dev mailbox → ' + config.appUrl + '/dev-mailbox.html' }[emailMode]}`);
    console.log(`   SMS:      ${{ twilio: 'Twilio', dev: 'dev SMS log → ' + config.appUrl + '/dev-mailbox.html', disabled: 'not configured (phone verification unavailable)' }[smsMode]}`);
    console.log(`   AI:       ${llm.providerLabel}`);
    console.log(`   Maps:     ${config.mapsKey ? 'Google Places API' : 'keyless Google Maps embed'}`);
    if (seeded || !config.isProd) console.log('   Demo logins → admin@pawpal.com / Admin@123 · staff@pawpal.com / Staff@123 · user@pawpal.com / User@123\n');
  });
}

if (require.main === module) {
  start().catch((err) => { console.error('❌ PawPal failed to start:', err.message); process.exit(1); });
}

module.exports = { app, start };
