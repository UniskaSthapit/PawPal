// FR-03 Role-based access: unit tests for the security middleware (Pratikshya Bhujel)
// Run with: node --test tests/roles.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth, requireAdopter, requireStaff, requireAdmin } = require('../src/middleware/auth');

// A tiny fake Express response that remembers the status and body
function fakeRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
// Runs a middleware and reports whether it let the request through
function run(mw, user) {
  const res = fakeRes(); let passed = false;
  mw({ user }, res, () => { passed = true; });
  return { passed, status: res.statusCode, error: res.body?.error };
}
const adopter = { id: 'u1', role: 'user' };
const staff = { id: 's1', role: 'staff', twoFactor: { enabled: true } };
const admin = { id: 'a1', role: 'admin', twoFactor: { enabled: true } };

describe('requireAuth', () => {
  test('logged-out request gets 401', () => assert.equal(run(requireAuth, null).status, 401));
  test('any logged-in user passes', () => assert.ok(run(requireAuth, adopter).passed));
});

describe('requireAdopter', () => {
  test('adopter passes', () => assert.ok(run(requireAdopter, adopter).passed));
  test('staff gets 403', () => assert.equal(run(requireAdopter, staff).status, 403));
});

describe('requireStaff', () => {
  test('logged-out request gets 401', () => assert.equal(run(requireStaff, null).status, 401));
  test('adopter gets 403 "Staff access only."', () => {
    const r = run(requireStaff, adopter);
    assert.equal(r.status, 403);
    assert.equal(r.error, 'Staff access only.');
  });
  test('staff and admin pass', () => {
    assert.ok(run(requireStaff, staff).passed);
    assert.ok(run(requireStaff, admin).passed);
  });
});

describe('requireAdmin', () => {
  test('adopter and staff get 403 "Administrator access only."', () => {
    for (const u of [adopter, staff]) {
      const r = run(requireAdmin, u);
      assert.equal(r.status, 403);
      assert.equal(r.error, 'Administrator access only.');
    }
  });
  test('admin passes', () => assert.ok(run(requireAdmin, admin).passed));
});