// File database (JSON store): unit tests for the offline database (Sushrit Phuyal)
// Run with: node --test tests/json-store.test.js
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

// Use a throwaway file so the test never touches real data
process.env.PAWPAL_DATA_FILE = path.join(os.tmpdir(), `pawpal-store-test-${Date.now()}.json`);
const { createJsonStore } = require('../src/db/json-store');

describe('JSON store', () => {
  const db = createJsonStore();
  before(async () => { await db.init(); });

  test('insert then findOne returns the same document', async () => {
    await db.insert('pets', { id: 'p1', name: 'Biscuit', status: 'Available' });
    assert.equal((await db.findOne('pets', { id: 'p1' })).name, 'Biscuit');
  });
  test('returned documents are copies, so changing them does not change the database', async () => {
    const p = await db.findOne('pets', { id: 'p1' });
    p.name = 'Changed';
    assert.equal((await db.findOne('pets', { id: 'p1' })).name, 'Biscuit');
  });
  test('updateWhere only updates while the filter still matches (no double booking)', async () => {
    await db.insert('slots', { id: 's1', bookedBy: null });
    const first = await db.updateWhere('slots', { id: 's1', bookedBy: null }, { bookedBy: 'app1' });
    const second = await db.updateWhere('slots', { id: 's1', bookedBy: null }, { bookedBy: 'app2' });
    assert.equal(first.bookedBy, 'app1');
    assert.equal(second, null);
  });
  test('count and removeWhere work together', async () => {
    await db.insert('pets', { id: 'p2', name: 'Max', status: 'Adopted' });
    assert.equal(await db.count('pets'), 2);
    assert.equal(await db.removeWhere('pets', { status: 'Adopted' }), 1);
    assert.equal(await db.count('pets'), 1);
  });
});