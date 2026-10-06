// Simulated adoption-fee payments. NO real payments: only the published test card numbers are accepted and
// nothing is sent to a payment provider. The full card number and CVC are never stored or logged — only the
// brand and last 4 digits are kept with the payment record.
const crypto = require('crypto');
const { HttpError } = require('../utils');

// Test cards → simulated outcome
const TEST_CARDS = {
  '4242424242424242': { status: 'succeeded' },
  '4000000000000002': { status: 'declined', message: 'Your card was declined. Try another test card, or choose to pay at the shelter.' },
  '4000000000009995': { status: 'insufficient_funds', message: 'Your card has insufficient funds. Try another test card, or choose to pay at the shelter.' },
};

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

const brandOf = (digits) => (/^4/.test(digits) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(digits) ? 'Mastercard' : /^3[47]/.test(digits) ? 'American Express' : 'Card');

// Validates the card form and returns only what may be kept: { brand, last4, outcome }.
// Errors carry a `field` so the form can point at the right input.
function checkCard(card = {}, nowDate = new Date()) {
  const fail = (field, message) => { throw Object.assign(new HttpError(400, message), { field }); };
  const digits = String(card.number || '').replace(/[\s-]/g, '');
  const name = String(card.name || '').trim();
  const cvc = String(card.cvc || '').trim();
  const expiry = String(card.expiry || '').replace(/\s/g, '');
  if (name.length < 2 || name.length > 80 || !/^[\p{L}][\p{L}' .-]*$/u.test(name)) fail('name', 'Enter the name on the card.');
  if (!/^\d{12,19}$/.test(digits)) fail('number', 'Enter the card number (digits only).');
  if (!luhn(digits)) fail('number', 'That card number isn\'t valid — check the digits.');
  const outcome = TEST_CARDS[digits];
  if (!outcome) fail('number', 'Use a test card for this simulation (for example 4242 4242 4242 4242).');
  const m = /^(\d{2})\/(\d{2}|\d{4})$/.exec(expiry);
  if (!m) fail('expiry', 'Enter the expiry date as MM/YY.');
  const month = Number(m[1]); const year = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
  if (month < 1 || month > 12) fail('expiry', 'The expiry month must be between 01 and 12.');
  const endOfMonth = new Date(year, month, 1); // first moment after the expiry month
  if (endOfMonth <= nowDate) fail('expiry', 'This card has expired.');
  if (year > nowDate.getFullYear() + 20) fail('expiry', 'Check the expiry year.');
  if (!/^\d{3}$/.test(cvc)) fail('cvc', 'The CVC is the 3 digits on the back of the card.');
  return { brand: brandOf(digits), last4: digits.slice(-4), outcome };
}

// e.g. PP-20261004-7F3A9C
const receiptNumber = (d = new Date()) => `PP-${d.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

module.exports = { checkCard, luhn, brandOf, receiptNumber, TEST_CARDS };
