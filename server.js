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
const { ensureOwnerAdmin, disableDemoAccountsInProduction } = require('./src/services/bootstrap');
const { loadUser, isStaffRole } = require('./src/middleware/auth');
const llm = require('./src/services/llm');
const { emailMode } = require('./src/services/mailer');
const { smsMode } = require('./src/services/sms');

const app = express();
app.set('trust proxy', 1); // correct client IPs behind Render/Railway proxies (rate limiting)

// Security headers, including a Content-Security-Policy: scripts only from this site (no inline scripts),
// images from this site/Unsplash/uploads, maps embedded from Google, fonts self-hosted.
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'frame-src': ["'self'", 'https://www.google.com', 'https://maps.google.com'],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': config.isProd ? [] : null,
    },
  },
}));
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
app.use('/api/slots', require('./src/routes/slots'));
app.use('/api/ai', require('./src/routes/ai'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api', require('./src/routes/misc'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- Page protection (server-side, so protected pages never flash) ----------
const STAFF_PAGES = ['index.html', 'pets.html', 'add-pet.html', 'applications.html', 'analytics.html', 'settings.html', 'enquiries.html', 'assistant.html', 'flyer.html', 'availability.html'];
const ADMIN_PAGES = ['admin.html'];
const ADOPTER_PAGES = ['dashboard.html', 'my-applications.html', 'inquiry-form.html'];
const ACCOUNT_PAGES = ['profile.html', 'notifications.html'];
app.get('/', (req, res) => res.redirect('/home.html'));
// Short pet profile links for posters, flyers and social posts: /p/<petId>
app.get(/^\/p\/([\w-]{1,40})$/, (req, res) => res.redirect(302, `/pet-profile.html?id=${encodeURIComponent(req.params[0])}`));
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

// Pages, scripts and styles are revalidated on every visit so a new deploy never mixes an old page with new scripts
// (which left sections stuck on "Loading"); images and fonts can be cached.
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: config.isProd ? '1h' : 0,
  setHeaders: (res, file) => { if (/\.(html|js|css)$/.test(file)) res.setHeader('Cache-Control', 'no-cache'); },
}));
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
  await require('./src/services/settings').getSettings(); // cache site settings (e.g. "Require 2FA for staff")
  const owner = await ensureOwnerAdmin();
  const disabledDemo = await disableDemoAccountsInProduction();
  app.listen(config.port, () => {
    console.log(`\n🐾 PawPal is running at ${config.appUrl}`);
    console.log(`   Database: ${db.name}${seeded ? ' (demo data loaded)' : migrated ? ' (data upgraded to the latest schema)' : ''}`);
    console.log(`   Email:    ${{ gmail: 'Gmail API', resend: 'Resend API', brevo: 'Brevo API', smtp: 'SMTP ' + config.smtp.host, dev: 'dev mailbox → ' + config.appUrl + '/dev-mailbox.html' }[emailMode]}${emailMode !== 'dev' ? ` (from ${config.mailFrom})` : ''}`);
    console.log(`   SMS:      ${{ twilio: 'Twilio', dev: 'dev SMS log → ' + config.appUrl + '/dev-mailbox.html', disabled: 'not configured (phone verification unavailable)' }[smsMode]}`);
    console.log(`   AI:       ${llm.providerLabel}`);
    console.log(`   Maps:     ${config.mapsKey ? 'Google Places API' : 'keyless Google Maps embed'}`);
    if (owner) console.log(`   Admin:    ${owner.user.email} — ${{ ok: 'administrator', promoted: 'promoted to administrator', created: `account created; set-password email ${owner.emailed ? 'sent' : 'NOT sent (check email settings, or use Forgot password)'}` }[owner.status]}`);
    if (disabledDemo.length) console.log(`   Security: deactivated demo accounts still using their published passwords: ${disabledDemo.join(', ')}`);
    if (!config.isProd) console.log('   Demo logins → admin@pawpal.com / Admin@123 · staff@pawpal.com / Staff@123 · user@pawpal.com / User@123\n');
  });
}

if (require.main === module) {
  start().catch((err) => { console.error('❌ PawPal failed to start:', err.message); process.exit(1); });
}

module.exports = { app, start };
