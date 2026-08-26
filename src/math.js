'use strict';

const { createLogger } = require('./logger');

const logger = createLogger();

function _toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    return Number.isFinite(num) ? num : NaN;
  }
  return NaN;
}

const toFiniteNumber = logger.wrap(_toFiniteNumber, { name: 'toFiniteNumber' });

function add(a, b) {
  const numA = _toFiniteNumber(a);
  const numB = _toFiniteNumber(b);

  if (!Number.isFinite(numA) || !Number.isFinite(numB)) {
    throw new TypeError('add expects two numeric values');
  }

  const sum = numA + numB;

  if (!Number.isFinite(sum)) {
    return sum > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
  }

  return sum === 0 ? 0 : sum;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

function isEven(n) {
  return n % 2 === 0;
}

function isOdd(n) {
  return n % 2 !== 0;
}

function factorial(n) {
  if (n < 0) {
    throw new Error('Factorial is not defined for negative numbers');
  }
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

function fibonacci(n) {
  if (n < 0) {
    throw new Error('Fibonacci is not defined for negative numbers');
  }
  if (n === 0) return 0;
  if (n === 1) return 1;

  let prev = 0;
  let curr = 1;
  for (let i = 2; i <= n; i++) {
    const next = prev + curr;
    prev = curr;
    curr = next;
  }
  return curr;
}

function modulo(a, b) {
  const dividend = toFiniteNumber(a);
  const divisor = toFiniteNumber(b);

  if (!Number.isFinite(dividend) || !Number.isFinite(divisor) || divisor === 0) {
    return 0;
  }

  return dividend % divisor;
}

module.exports = {
  add: logger.wrap(add, { name: 'add' }),
  subtract: logger.wrap(subtract, { name: 'subtract' }),
  multiply: logger.wrap(multiply, { name: 'multiply' }),
  divide: logger.wrap(divide, { name: 'divide' }),
  isEven: logger.wrap(isEven, { name: 'isEven' }),
  isOdd: logger.wrap(isOdd, { name: 'isOdd' }),
  factorial: logger.wrap(factorial, { name: 'factorial' }),
  fibonacci: logger.wrap(fibonacci, { name: 'fibonacci' }),
  modulo: logger.wrap(modulo, { name: 'modulo' }),
};
