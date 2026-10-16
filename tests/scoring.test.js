// FR-08 Suitability score: unit tests for each scoring rule (Sushrit Phuyal)
// Run with: node --test tests/scoring.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { calculateSuitabilityScore } = require('../src/services/scoring');

const pet = { requiresYard: false, energyLevel: 2, goodWithChildren: true, goodWithOtherPets: true };
const base = { livingType: 'Apartment', activityLevel: 2, hasChildren: false, hasOtherPets: false, experience: 'Experienced', hoursAlone: 4 };
const points = (r, prefix) => r.breakdown.find((b) => b.text.startsWith(prefix)).points;

describe('calculateSuitabilityScore', () => {
  test('a well-matched applicant scores 95 (High Match)', () => {
    const r = calculateSuitabilityScore(base, pet);
    assert.equal(r.score, 20 + 25 + 20 + 15 + 15);
    assert.equal(r.label, 'High Match');
  });
  test('children with a pet that is not good with children scores 0 for that rule', () => {
    const r = calculateSuitabilityScore({ ...base, hasChildren: true }, { ...pet, goodWithChildren: false });
    assert.equal(points(r, 'Children'), 0);
  });
  test('other pets with a pet that is not good with other pets scores 5', () => {
    const r = calculateSuitabilityScore({ ...base, hasOtherPets: true }, { ...pet, goodWithOtherPets: false });
    assert.equal(points(r, 'Other pets'), 5);
  });
  test('experience: 15 experienced, 10 some, 5 first-time', () => {
    assert.equal(points(calculateSuitabilityScore(base, pet), 'Experience'), 15);
    assert.equal(points(calculateSuitabilityScore({ ...base, experience: 'Some experience' }, pet), 'Experience'), 10);
    assert.equal(points(calculateSuitabilityScore({ ...base, experience: 'First-time owner' }, pet), 'Experience'), 5);
  });
  test('a high-energy pet alone 8+ hours adds a staff note', () => {
    const r = calculateSuitabilityScore({ ...base, hoursAlone: 9 }, { ...pet, energyLevel: 3 });
    assert.equal(r.notes.length, 1);
  });
  test('missing answers return an error instead of a score', () => {
    assert.match(calculateSuitabilityScore({ livingType: 'Apartment' }, pet).error, /Incomplete/);
  });
});