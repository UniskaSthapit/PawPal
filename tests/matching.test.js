// FR-05 AI pet matching: unit tests for the explainable matching engine (Pratikshya Bhujel)
// Run with: node --test tests/matching.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseProfile, evaluateMatch, rankPets } = require('../src/services/matching');

const calmFlatDog = { id: 'p1', name: 'Biscuit', type: 'Dog', energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true, size: 'Small' };
const busyYardDog = { id: 'p2', name: 'Max', type: 'Dog', energyLevel: 3, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true, size: 'Large' };

describe('parseProfile', () => {
  test('reads an apartment and a first-time owner from plain English', () => {
    const p = parseProfile("I live in an apartment, work 9 to 5 and I've never had a pet");
    assert.equal(p.homeType, 'apartment');
    assert.ok(p.experience, 'experience should be detected');
  });
});

describe('evaluateMatch', () => {
  const apartmentLife = { homeType: 'apartment', activity: 1, preferredType: 'Dog' };
  test('score always stays between 5 and 97', () => {
    for (const pet of [calmFlatDog, busyYardDog]) {
      const { score } = evaluateMatch(pet, apartmentLife);
      assert.ok(score >= 5 && score <= 97, `score was ${score}`);
    }
  });
  test('a calm small dog suits an apartment better than a high-energy yard dog', () => {
    assert.ok(evaluateMatch(calmFlatDog, apartmentLife).score > evaluateMatch(busyYardDog, apartmentLife).score);
  });
  test('every match explains itself with reasons', () => {
    const r = evaluateMatch(calmFlatDog, apartmentLife);
    assert.ok(Array.isArray(r.reasons) && r.reasons.length > 0);
    assert.ok(r.reasons.length <= 4);
  });
});

describe('rankPets', () => {
  test('puts the best match first', () => {
    const ranked = rankPets([busyYardDog, calmFlatDog], { homeType: 'apartment', activity: 1, preferredType: 'Dog' }, 2);
    assert.equal(ranked[0].pet.id, 'p1');
  });
});