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

function gramsToKilograms(grams) {
  const num = _toFiniteNumber(grams);

  if (!Number.isFinite(num)) {
    throw new TypeError('Input must be a valid numeric value in grams');
  }

  if (num < 0) {
    throw new RangeError('Input must be a non-negative value');
  }

  const kg = num / 1000;
  return `${kg} kg`;
}

module.exports = {
  gramsToKilograms: logger.wrap(gramsToKilograms, { name: 'gramsToKilograms' }),
};
