'use strict';

function getDateParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday,
  };
}

function getDateInTimeZone(year, month, day, hour, timeZone) {
  const target = { year, month, day };
  const initial = Date.UTC(year, month - 1, day, 12, 0, 0);
  for (let offset = 0; offset <= 48; offset++) {
    for (const sign of [1, -1]) {
      const candidate = new Date(initial + sign * offset * 60 * 60 * 1000);
      const parts = getDateParts(candidate, timeZone);
      if (parts.year === target.year && parts.month === target.month && parts.day === target.day) {
        return candidate;
      }
    }
  }
  return new Date(initial);
}

function getPeriodFromDate(date, timeZone) {
  const { year, month } = getDateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getPreviousPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getNextPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getDaysInMonth(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getMonthRange(period) {
  const days = getDaysInMonth(period);
  return {
    start: `${period}-01`,
    end: `${period}-${String(days).padStart(2, '0')}`,
  };
}

function getFirstWorkingDayOfMonth(year, month, timeZone) {
  for (let day = 1; day <= 7; day++) {
    const date = getDateInTimeZone(year, month, day, 12, timeZone);
    const parts = getDateParts(date, timeZone);
    if (parts.day === day && parts.weekday !== 'Sat' && parts.weekday !== 'Sun') {
      return day;
    }
  }
  return 1;
}

function isFirstWorkingDayOfMonth(date, timeZone) {
  const parts = getDateParts(date, timeZone);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') {
    return false;
  }
  const first = getFirstWorkingDayOfMonth(parts.year, parts.month, timeZone);
  return parts.day === first;
}

function getReportPeriodForDate(date, timeZone) {
  const currentPeriod = getPeriodFromDate(date, timeZone);
  return getPreviousPeriod(currentPeriod);
}

module.exports = {
  getDateParts,
  getPeriodFromDate,
  getPreviousPeriod,
  getNextPeriod,
  getDaysInMonth,
  getMonthRange,
  getFirstWorkingDayOfMonth,
  isFirstWorkingDayOfMonth,
  isFirstBusinessDay: isFirstWorkingDayOfMonth,
  getReportPeriodForDate,
};
