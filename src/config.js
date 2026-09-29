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
  mailFrom: env.MAIL_FROM || 'PawPal <no-reply@pawpal.app>',

  openaiKey: env.OPENAI_API_KEY || '',
  openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',

  mapsKey: env.GOOGLE_MAPS_API_KEY || '',

  allowDemoReset: String(env.ALLOW_DEMO_RESET ?? 'true').toLowerCase() === 'true',
};