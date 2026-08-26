'use strict';

function addThousandsSeparators(digits) {
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) {
      result += '.';
    }
    result += digits[i];
  }
  return result;
}

function formatIDR(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 'Rp0';
  }
  const rounded = Math.round(num);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const digits = String(abs);
  const withSeparators = addThousandsSeparators(digits);
  return `${negative ? '-' : ''}Rp${withSeparators}`;
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  const rounded = Math.round(num);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const digits = String(abs);
  const withSeparators = addThousandsSeparators(digits);
  return `${negative ? '-' : ''}${withSeparators}`;
}

module.exports = {
  formatIDR,
  formatRupiah: formatIDR,
  formatNumber,
};
