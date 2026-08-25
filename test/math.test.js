'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const math = require('../src/math');

test('add adds two numbers', () => {
  assert.equal(math.add(2, 3), 5);
  assert.equal(math.add(-1, 1), 0);
  assert.equal(math.add(0, 0), 0);
});

test('subtract subtracts two numbers', () => {
  assert.equal(math.subtract(5, 3), 2);
  assert.equal(math.subtract(2, 5), -3);
  assert.equal(math.subtract(0, 0), 0);
});

test('multiply multiplies two numbers', () => {
  assert.equal(math.multiply(4, 3), 12);
  assert.equal(math.multiply(-2, 3), -6);
  assert.equal(math.multiply(0, 5), 0);
});

test('divide divides two numbers', () => {
  assert.equal(math.divide(10, 2), 5);
  assert.equal(math.divide(1, 4), 0.25);
  assert.equal(math.divide(-6, 3), -2);
});

test('divide throws an Error when dividing by zero', () => {
  assert.throws(() => math.divide(1, 0), /Division by zero/);
  assert.throws(() => math.divide(-5, 0), Error);
});

test('isEven returns true for even numbers', () => {
  assert.equal(math.isEven(4), true);
  assert.equal(math.isEven(0), true);
  assert.equal(math.isEven(-2), true);
});

test('isEven returns false for odd numbers', () => {
  assert.equal(math.isEven(3), false);
  assert.equal(math.isEven(-1), false);
});

test('isOdd returns true for odd numbers', () => {
  assert.equal(math.isOdd(3), true);
  assert.equal(math.isOdd(-3), true);
  assert.equal(math.isOdd(1), true);
});

test('isOdd returns false for even numbers', () => {
  assert.equal(math.isOdd(4), false);
  assert.equal(math.isOdd(0), false);
  assert.equal(math.isOdd(-2), false);
});

test('factorial computes the factorial of a number', () => {
  assert.equal(math.factorial(0), 1);
  assert.equal(math.factorial(1), 1);
  assert.equal(math.factorial(5), 120);
  assert.equal(math.factorial(7), 5040);
});

test('factorial throws an Error for negative numbers', () => {
  assert.throws(() => math.factorial(-1), /negative/);
  assert.throws(() => math.factorial(-10), Error);
});

test('fibonacci returns the nth Fibonacci number', () => {
  assert.equal(math.fibonacci(0), 0);
  assert.equal(math.fibonacci(1), 1);
  assert.equal(math.fibonacci(2), 1);
  assert.equal(math.fibonacci(10), 55);
});

test('fibonacci throws an Error for negative numbers', () => {
  assert.throws(() => math.fibonacci(-1), /negative/);
});
