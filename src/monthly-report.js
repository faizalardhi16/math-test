'use strict';

const { buildMonthlyReportPdf } = require('./pdf');
const { formatIDR, formatNumber } = require('./idr');
const {
  getDateParts,
  getPeriodFromDate,
  getPreviousPeriod,
  getMonthRange,
  getDaysInMonth,
  isFirstWorkingDayOfMonth,
} = require('./business-calendar');
const { createLogger } = require('./logger');

const logger = createLogger();

function isValidPeriod(period) {
  if (typeof period !== 'string') return false;
  const parts = period.split('-');
  if (parts.length !== 2) return false;
  const [year, month] = parts.map(Number);
  return parts[0].length === 4 && parts[1].length === 2 && Number.isInteger(year) && year >= 1 && Number.isInteger(month) && month >= 1 && month <= 12;
}

function validatePeriod(period) {
  if (!isValidPeriod(period)) {
    throw new TypeError('period must be in YYYY-MM format');
  }
}

function isValidDate(date) {
  if (typeof date !== 'string') return false;
  const parts = date.split('-');
  if (parts.length !== 3) return false;
  const [year, month, day] = parts.map(Number);
  return parts[0].length === 4 && parts[1].length === 2 && parts[2].length === 2 && Number.isInteger(year) && year >= 1 && Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= 31;
}

function validateDate(date) {
  if (!isValidDate(date)) {
    throw new TypeError('date must be in YYYY-MM-DD format');
  }
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false;
  const domain = email.slice(at + 1);
  const dot = domain.indexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

function toDate(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('invalid date');
  }
  return date;
}

function createMonthlyReportSystem(options = {}) {
  const timeZone = options.timeZone || 'Asia/Jakarta';
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const mailer = options.mailer || null;

  const transactions = [];
  const reports = new Map();
  const recipients = new Set();
  const closingFinal = new Set();

  if (Array.isArray(options.recipients)) {
    for (const email of options.recipients) {
      if (isValidEmail(email)) {
        recipients.add(email);
      }
    }
  }

  function recordTransaction(input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('recordTransaction expects an object');
    }
    if (typeof input.id !== 'string' || input.id.length === 0) {
      throw new TypeError('transaction id is required');
    }

    let date = input.date || input.transactionDate;
    if (date instanceof Date) {
      const parts = getDateParts(date, timeZone);
      date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    }
    validateDate(date);

    const amount = Number(input.amount !== undefined ? input.amount : input.value);
    if (!Number.isFinite(amount)) {
      throw new TypeError('transaction amount must be a finite number');
    }

    let type = input.type || 'revenue';
    if (type === 'expense') type = 'operational_cost';
    if (type !== 'revenue' && type !== 'operational_cost') {
      throw new TypeError('transaction type must be revenue or operational_cost');
    }

    const recordedAt = toDate(input.recordedAt || input.createdAt, now());
    const transaction = { id: input.id, date, amount, type, recordedAt };
    transactions.push(transaction);
    return transaction;
  }

  function addRecipient(email) {
    if (!isValidEmail(email)) {
      throw new TypeError('invalid email address');
    }
    recipients.add(email);
    return email;
  }

  function removeRecipient(email) {
    return recipients.delete(email);
  }

  function setRecipients(emails) {
    recipients.clear();
    for (const email of emails || []) {
      addRecipient(email);
    }
    return listRecipients();
  }

  function listRecipients() {
    return [...recipients];
  }

  function markClosingFinal(period) {
    validatePeriod(period);
    closingFinal.add(period);
  }

  function isClosingFinal(period) {
    validatePeriod(period);
    return closingFinal.has(period);
  }

  function isInPeriod(dateStr, period) {
    const range = getMonthRange(period);
    return dateStr >= range.start && dateStr <= range.end;
  }

  function getIncludedTransactions(period, generationTime) {
    const previousPeriod = getPreviousPeriod(period);
    const previousReport = reports.get(previousPeriod);
    return transactions.filter((tx) => {
      if (isInPeriod(tx.date, period)) {
        return tx.recordedAt.getTime() <= generationTime.getTime();
      }
      if (previousReport && isInPeriod(tx.date, previousPeriod)) {
        return tx.recordedAt.getTime() > previousReport.publishedAt.getTime();
      }
      return false;
    });
  }

  function buildDailySeries(period, included) {
    const days = getDaysInMonth(period);
    const byDate = new Map();
    for (let day = 1; day <= days; day++) {
      const dateStr = `${period}-${String(day).padStart(2, '0')}`;
      byDate.set(dateStr, { date: dateStr, revenue: 0, operationalCost: 0, netProfit: 0 });
    }
    for (const tx of included) {
      const entry = byDate.get(tx.date);
      if (!entry) continue;
      if (tx.type === 'revenue') {
        entry.revenue += tx.amount;
      } else if (tx.type === 'operational_cost') {
        entry.operationalCost += tx.amount;
      }
      entry.netProfit = entry.revenue - entry.operationalCost;
    }
    return [...byDate.values()];
  }

  function computeMetrics(period, generationTime) {
    const included = getIncludedTransactions(period, generationTime);
    let revenue = 0;
    let operationalCost = 0;
    for (const tx of included) {
      if (tx.type === 'revenue') revenue += tx.amount;
      else if (tx.type === 'operational_cost') operationalCost += tx.amount;
    }
    return {
      period,
      revenue,
      operationalCost,
      netProfit: revenue - operationalCost,
      transactionCount: included.length,
      daily: buildDailySeries(period, included),
      hasActivity: included.length > 0,
    };
  }

  function buildComparison(metrics, previousMetrics) {
    const prev = previousMetrics || { revenue: 0, transactionCount: 0, operationalCost: 0, netProfit: 0 };
    const compare = (current, previous) => {
      const direction = current > previous ? 'up' : current < previous ? 'down' : 'flat';
      return { current, previous, direction, change: current - previous };
    };
    return {
      revenue: compare(metrics.revenue, prev.revenue),
      transactionCount: compare(metrics.transactionCount, prev.transactionCount),
      operationalCost: compare(metrics.operationalCost, prev.operationalCost),
      netProfit: compare(metrics.netProfit, prev.netProfit),
      previous: {
        revenue: prev.revenue,
        transactionCount: prev.transactionCount,
        operationalCost: prev.operationalCost,
        netProfit: prev.netProfit,
      },
    };
  }

  function sendReportEmails(report) {
    if (!mailer || typeof mailer.send !== 'function') return;
    for (const email of report.recipients) {
      try {
        mailer.send({
          to: email,
          subject: `Laporan Bulanan ${report.period}`,
          attachment: {
            filename: `laporan-bulanan-${report.period}.pdf`,
            content: report.pdf,
          },
          report,
        });
      } catch (_) {
        // Email failures must not break report generation.
      }
    }
  }

  function generateReport(period) {
    const generationTime = now();
    if (period === undefined) {
      const currentPeriod = getPeriodFromDate(generationTime, timeZone);
      period = getPreviousPeriod(currentPeriod);
    }
    validatePeriod(period);
    if (reports.has(period)) {
      return reports.get(period);
    }

    const metrics = computeMetrics(period, generationTime);
    const previousPeriod = getPreviousPeriod(period);
    const previousReport = reports.get(previousPeriod);
    const previousMetrics = previousReport
      ? previousReport.metrics
      : computeMetrics(previousPeriod, generationTime);
    const comparison = buildComparison(metrics, previousMetrics);
    const isFinal = closingFinal.has(period);
    const recipientSnapshot = [...recipients];

    const report = {
      period,
      generatedAt: generationTime,
      publishedAt: generationTime,
      recipients: recipientSnapshot,
      isFinal,
      metrics,
      comparison,
      pdf: buildMonthlyReportPdf({
        period,
        publishedAt: generationTime,
        recipients: recipientSnapshot,
        isFinal,
        metrics,
        comparison,
      }),
    };

    reports.set(period, report);
    sendReportEmails(report);
    return report;
  }

  function getReport(period) {
    validatePeriod(period);
    return reports.get(period) || null;
  }

  function getReportPdf(period) {
    const report = getReport(period);
    return report ? report.pdf : null;
  }

  function downloadReport(period) {
    return getReportPdf(period);
  }

  function listReports() {
    return [...reports.values()];
  }

  function generateDueReports() {
    const current = now();
    if (!isFirstWorkingDayOfMonth(current, timeZone)) {
      return [];
    }
    const currentPeriod = getPeriodFromDate(current, timeZone);
    const reportPeriod = getPreviousPeriod(currentPeriod);
    if (reports.has(reportPeriod)) {
      return [];
    }
    return [generateReport(reportPeriod)];
  }

  function isReportDue(date) {
    const target = date || now();
    return isFirstWorkingDayOfMonth(target, timeZone);
  }

  function getDashboardViewModel() {
    return {
      reports: listReports().map((report) => ({
        period: report.period,
        publishedAt: report.publishedAt,
        isFinal: report.isFinal,
        recipients: report.recipients,
        metrics: report.metrics,
        comparison: report.comparison,
        downloadUrl: `/reports/${report.period}.pdf`,
        pdf: report.pdf,
      })),
      recipients: listRecipients(),
    };
  }

  return {
    recordTransaction: logger.wrap(recordTransaction, { name: 'recordTransaction' }),
    addRecipient: logger.wrap(addRecipient, { name: 'addRecipient' }),
    removeRecipient: logger.wrap(removeRecipient, { name: 'removeRecipient' }),
    setRecipients: logger.wrap(setRecipients, { name: 'setRecipients' }),
    listRecipients: logger.wrap(listRecipients, { name: 'listRecipients' }),
    markClosingFinal: logger.wrap(markClosingFinal, { name: 'markClosingFinal' }),
    isClosingFinal: logger.wrap(isClosingFinal, { name: 'isClosingFinal' }),
    generateReport: logger.wrap(generateReport, { name: 'generateReport' }),
    generateDueReports: logger.wrap(generateDueReports, { name: 'generateDueReports' }),
    isReportDue: logger.wrap(isReportDue, { name: 'isReportDue' }),
    getReport: logger.wrap(getReport, { name: 'getReport' }),
    getReportPdf: logger.wrap(getReportPdf, { name: 'getReportPdf' }),
    downloadReport: logger.wrap(downloadReport, { name: 'downloadReport' }),
    listReports: logger.wrap(listReports, { name: 'listReports' }),
    getDashboardViewModel: logger.wrap(getDashboardViewModel, { name: 'getDashboardViewModel' }),
  };
}

function generateMonthlyReport(transactions, options = {}) {
  const system = createMonthlyReportSystem(options);
  for (const tx of transactions || []) {
    system.recordTransaction(tx);
  }
  const timeZone = options.timeZone || 'Asia/Jakarta';
  const nowFn = typeof options.now === 'function' ? options.now : () => new Date();
  const period = options.period || getPreviousPeriod(getPeriodFromDate(nowFn(), timeZone));
  return system.generateReport(period);
}

module.exports = {
  createMonthlyReportSystem,
  generateMonthlyReport: logger.wrap(generateMonthlyReport, { name: 'generateMonthlyReport' }),
  formatIDR,
  formatNumber,
};
