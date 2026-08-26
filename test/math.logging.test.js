'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function captureLogs(fn) {
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  let value;
  let error;
  try {
    value = fn();
  } catch (err) {
    error = err;
  }
  if (value && typeof value.then === 'function') {
    return value.then(
      (v) => {
        console.log = originalLog;
        return { lines, value: v, error: undefined };
      },
      (e) => {
        console.log = originalLog;
        return { lines, value: undefined, error: e };
      }
    );
  }
  console.log = originalLog;
  return { lines, value, error };
}

test('math.add logs started and completed entries', () => {
  const math = require('../src/math');
  const { lines, value } = captureLogs(() => math.add(2, 3));
  assert.equal(value, 5);
  assert.equal(lines.length, 2);
  const start = JSON.parse(lines[0]);
  const completed = JSON.parse(lines[1]);
  assert.equal(start.status, 'started');
  assert.equal(start.function, 'add');
  assert.ok(start.timestamp);
  assert.deepEqual(start.args, [2, 3]);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.function, 'add');
  assert.equal(completed.result, 5);
});

test('math.divide logs a failed entry when it throws', () => {
  const math = require('../src/math');
  const { lines, error } = captureLogs(() => math.divide(1, 0));
  assert.ok(error);
  assert.equal(lines.length, 2);
  const start = JSON.parse(lines[0]);
  const failed = JSON.parse(lines[1]);
  assert.equal(start.status, 'started');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.function, 'divide');
  assert.equal(failed.error.type, 'Error');
  assert.equal(failed.error.message, 'Division by zero');
});

test('math.modulo logs internal toFiniteNumber calls', () => {
  const math = require('../src/math');
  const { lines, value } = captureLogs(() => math.modulo(10, 3));
  assert.equal(value, 1);
  assert.equal(lines.length, 6);
  const statuses = lines.map((line) => JSON.parse(line).status);
  assert.equal(statuses.filter((s) => s === 'started').length, 3);
  assert.equal(statuses.filter((s) => s === 'completed').length, 3);
});
