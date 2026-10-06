// Central configuration — reads .env once and exposes typed settings.
require('dotenv').config({ quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.startsWith('change-me'))) {
  console.warn('⚠️  JWT_SECRET is not set. Set a long random JWT_SECRET before going live.');
}

module.exports = {
  isProd,
  port: Number(env.PORT) || 3000,
  appUrl: (env.APP_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/$/, ''),
  jwtSecret: env.JWT_SECRET || 'pawpal-dev-secret-change-me',
  jwtExpiresIn: '7d',

  mongoUri: env.MONGODB_URI || '',
  mongoDb: env.MONGODB_DB || 'pawpal',

  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    secure: String(env.SMTP_SECURE).toLowerCase() === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
  },
  // Resend sends mail over a normal HTTPS request instead of a raw SMTP connection.
  // Use this on hosts (like Render's free plan) that block outbound SMTP ports.
  // If set, it's used instead of SMTP. Get a free key at https://resend.com/api-keys
  resendApiKey: env.RESEND_API_KEY || '',
  // Gmail API: sends as your own Gmail address over HTTPS using an OAuth refresh token (see DEPLOY.md).
  // Used first when all three values are set. The sender defaults to ADMIN_EMAIL.
  gmail: {
    clientId: (env.GMAIL_CLIENT_ID || '').trim(),
    clientSecret: (env.GMAIL_CLIENT_SECRET || '').trim(),
    refreshToken: (env.GMAIL_REFRESH_TOKEN || '').trim(),
    sender: (env.GMAIL_SENDER || env.ADMIN_EMAIL || '').trim().toLowerCase(),
  },
  // Brevo can send from a single verified address (e.g. a Gmail account) over HTTPS: https://app.brevo.com/settings/keys/api
  brevoApiKey: env.BREVO_API_KEY || '',
  // The owner's address: becomes the administrator account on start-up and the default sender
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  // Public contact address shown on the site and on every shelter (defaults to the owner's address)
  contactEmail: (env.CONTACT_EMAIL || env.ADMIN_EMAIL || 'pawpaladmin@gmail.com').trim().toLowerCase(),
  // Most emails sent per day (Australia/Melbourne date). Protects the sending Gmail account from Google's limits.
  mailDailyLimit: Math.max(1, Number(env.MAIL_DAILY_LIMIT) || 300),
  // Wait before the single retry of a temporarily failed email (network error or provider 5xx)
  mailRetryDelayMs: Math.max(0, Number(env.MAIL_RETRY_DELAY_MS ?? 3000) || 0),
  mailFrom: env.MAIL_FROM || (env.ADMIN_EMAIL ? `PawPal <${env.ADMIN_EMAIL.trim()}>` : 'PawPal <no-reply@pawpal.app>'),

  // AI — Anthropic is used when its key is set, otherwise OpenAI, then Google Gemini, otherwise
  // PawPal's built-in rules engine (which still works on the real database).
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  openaiKey: env.OPENAI_API_KEY || '',
  openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
  // Google Gemini — has a free tier (key from https://aistudio.google.com/apikey, no card needed)
  geminiKey: env.GEMINI_API_KEY || '',
  geminiModel: env.GEMINI_MODEL || 'gemini-flash-latest',

  // SMS one-time codes for phone verification (Twilio Programmable Messaging)
  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID || '',
    authToken: env.TWILIO_AUTH_TOKEN || '',
    from: env.TWILIO_FROM_NUMBER || '',
  },
  defaultCountryCode: env.DEFAULT_COUNTRY_CODE || '+61',

  mapsKey: env.GOOGLE_MAPS_API_KEY || '',

  allowDemoReset: String(env.ALLOW_DEMO_RESET ?? 'true').toLowerCase() === 'true',
};
