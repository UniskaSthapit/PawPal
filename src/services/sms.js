// SMS delivery for phone verification codes.
// - With TWILIO_* settings: real SMS through Twilio's REST API.
// - Local development without Twilio: the message is stored and shown in the dev mailbox page.
// - Production without Twilio: sending is refused with a clear message (never pretends to send).
const config = require('../config');
const db = require('../db');
const { newId, now } = require('../utils');

const smsEnabled = Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.from);
const smsMode = smsEnabled ? 'twilio' : config.isProd ? 'disabled' : 'dev';

// Normalise to E.164: "+61" + "0412 345 678" → "+61412345678"
function toE164(countryCode, phone) {
  const cc = String(countryCode || config.defaultCountryCode).replace(/[^\d+]/g, '');
  let digits = String(phone || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  digits = digits.replace(/^0+/, '');
  const full = `${cc.startsWith('+') ? cc : '+' + cc}${digits}`;
  return /^\+\d{8,15}$/.test(full) ? full : null;
}

async function sendSms(to, body) {
  if (smsMode === 'disabled') {
    const err = new Error('Phone verification is not configured on this server yet. Please try again later.');
    err.status = 503;
    throw err;
  }
  const record = { id: newId('sms'), to, body, mode: smsMode, status: 'sent', sentAt: now() };
  if (smsEnabled) {
    const { accountSid, authToken, from } = config.twilio;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
      signal: AbortSignal.timeout(15000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (!res.ok) {
      record.status = 'failed';
      record.error = (await res.text()).slice(0, 300);
      console.error('📱 SMS failed:', record.error);
      await db.insert('sms', { ...record, body: '[code hidden]' });
      const err = new Error('We could not send a text message to that number. Check it and try again.');
      err.status = 502;
      throw err;
    }
    await db.insert('sms', { ...record, body: '[code hidden]' }); // never keep real codes at rest
  } else {
    console.log(`📱 [dev SMS] To: ${to} | ${body}`);
    await db.insert('sms', record);
  }
  return record;
}

module.exports = { sendSms, toE164, smsEnabled, smsMode };
