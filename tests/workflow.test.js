// FR-09 Application status workflow: checks the shared status lists stay consistent (Pemba Sange Sherpa)
// Run with: node --test tests/workflow.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { APP_STATUSES, APP_CLOSED, APP_NEEDS_DATE, APP_HOLDS_PET, APP_STATUS_INFO } = require('../src/constants');

describe('Application statuses', () => {
  test('there are exactly 10 unique statuses, from Submitted to Withdrawn', () => {
    assert.equal(APP_STATUSES.length, 10);
    assert.equal(new Set(APP_STATUSES).size, 10);
    assert.equal(APP_STATUSES[0], 'Submitted');
  });
  test('closed, date-required and pet-holding statuses are all real statuses', () => {
    for (const s of [...APP_CLOSED, ...APP_NEEDS_DATE, ...APP_HOLDS_PET]) assert.ok(APP_STATUSES.includes(s), s);
  });
  test('Interview, Meet & Greet and Adoption Scheduled need a date', () => {
    assert.deepEqual([...APP_NEEDS_DATE].sort(), ['Adoption Scheduled', 'Interview', 'Meet & Greet']);
  });
  test('a closed application never needs a date', () => {
    for (const s of APP_CLOSED) assert.ok(!APP_NEEDS_DATE.includes(s), s);
  });
  test('every status has a plain-English explanation for the adopter', () => {
    for (const s of APP_STATUSES) assert.ok(APP_STATUS_INFO[s], `missing explanation for ${s}`);
  });
});
