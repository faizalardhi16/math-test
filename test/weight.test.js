'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const weight = require('../src/weight');

test('gramsToKilograms converts valid numeric grams to kilograms', () => {
  assert.equal(weight.gramsToKilograms(2500), '2.5 kg');
  assert.equal(weight.gramsToKilograms(1000), '1 kg');
  assert.equal(weight.gramsToKilograms(500), '0.5 kg');
  assert.equal(weight.gramsToKilograms(100), '0.1 kg');
});

test('gramsToKilograms output includes the unit kg', () => {
  const result = weight.gramsToKilograms(2500);
  assert.ok(result.endsWith(' kg'));
});

test('gramsToKilograms converts 0 grams to 0 kg', () => {
  assert.equal(weight.gramsToKilograms(0), '0 kg');
});

test('gramsToKilograms preserves decimal gram accuracy', () => {
  assert.equal(weight.gramsToKilograms(1500.5), '1.5005 kg');
  assert.equal(weight.gramsToKilograms(0.5), '0.0005 kg');
  assert.equal(weight.gramsToKilograms(1), '0.001 kg');
  assert.equal(weight.gramsToKilograms(1234.5678), '1.2345678 kg');
});

test('gramsToKilograms handles large numbers', () => {
  assert.equal(weight.gramsToKilograms(1000000), '1000 kg');
  assert.equal(weight.gramsToKilograms(999999999), '999999.999 kg');
});

test('gramsToKilograms accepts numeric string input', () => {
  assert.equal(weight.gramsToKilograms('2500'), '2.5 kg');
  assert.equal(weight.gramsToKilograms('1500.5'), '1.5005 kg');
  assert.equal(weight.gramsToKilograms('0'), '0 kg');
});

test('gramsToKilograms rejects non-numeric input with a clear error', () => {
  assert.throws(() => weight.gramsToKilograms('abc'), /valid numeric/);
  assert.throws(() => weight.gramsToKilograms('12abc'), /valid numeric/);
  assert.throws(() => weight.gramsToKilograms(NaN), /valid numeric/);
  assert.throws(() => weight.gramsToKilograms(Infinity), /valid numeric/);
  assert.throws(() => weight.gramsToKilograms(undefined), /valid numeric/);
  assert.throws(() => weight.gramsToKilograms(null), /valid numeric/);
});

test('gramsToKilograms rejects empty input with a clear error', () => {
  assert.throws(() => weight.gramsToKilograms(''), /valid numeric/);
  assert.throws(() => weight.gramsToKilograms('   '), /valid numeric/);
});

test('gramsToKilograms rejects negative values', () => {
  assert.throws(() => weight.gramsToKilograms(-1), /non-negative/);
  assert.throws(() => weight.gramsToKilograms(-100), /non-negative/);
  assert.throws(() => weight.gramsToKilograms(-0.5), /non-negative/);
  assert.throws(() => weight.gramsToKilograms('-500'), /non-negative/);
});

test('gramsToKilograms returns a string', () => {
  assert.equal(typeof weight.gramsToKilograms(1000), 'string');
  assert.equal(typeof weight.gramsToKilograms(0), 'string');
});
