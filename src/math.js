'use strict';

function add(a, b) {
  return a + b;
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

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    return Number.isFinite(num) ? num : NaN;
  }
  return NaN;
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
  add,
  subtract,
  multiply,
  divide,
  isEven,
  isOdd,
  factorial,
  fibonacci,
  modulo
};
