'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMonthlyReportSystem,
  generateMonthlyReport,
} = require('../src/monthly-report');
const { formatIDR, formatNumber } = require('../src/idr');
const {
  getPreviousPeriod,
  getMonthRange,
  isFirstWorkingDayOfMonth,
  getPeriodFromDate,
} = require('../src/business-calendar');

function fixedNow(iso) {
  return () => new Date(iso);
}

test('formatIDR formats currency with thousands separators', () => {
  assert.equal(formatIDR(1000000), 'Rp1.000.000');
  assert.equal(formatIDR(0), 'Rp0');
  assert.equal(formatIDR(-2500000), '-Rp2.500.000');
  assert.equal(formatIDR(123456789), 'Rp123.456.789');
});

test('formatNumber formats plain numbers with thousands separators', () => {
  assert.equal(formatNumber(1234567), '1.234.567');
});

test('business calendar helpers work for Asia/Jakarta', () => {
  assert.equal(getPreviousPeriod('2026-01'), '2025-12');
  assert.equal(getPreviousPeriod('2026-03'), '2026-02');
  assert.deepEqual(getMonthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  assert.equal(isFirstWorkingDayOfMonth(new Date('2026-02-02T01:00:00+07:00'), 'Asia/Jakarta'), true);
  assert.equal(isFirstWorkingDayOfMonth(new Date('2026-02-03T01:00:00+07:00'), 'Asia/Jakarta'), false);
  assert.equal(getPeriodFromDate(new Date('2026-02-02T01:00:00+07:00'), 'Asia/Jakarta'), '2026-02');
});

test('generates report with metrics, comparison, and PDF', () => {
  const system = createMonthlyReportSystem({
    timeZone: 'Asia/Jakarta',
    now: fixedNow('2026-02-02T01:00:00+07:00'),
  });
  system.recordTransaction({
    id: 't1',
    date: '2026-01-05',
    amount: 1000000,
    type: 'revenue',
    recordedAt: '2026-01-05T10:00:00+07:00',
  });
  system.recordTransaction({
    id: 't2',
    date: '2026-01-06',
    amount: 200000,
    type: 'operational_cost',
    recordedAt: '2026-01-06T10:00:00+07:00',
  });
  system.markClosingFinal('2026-01');

  const report = system.generateReport('2026-01');

  assert.equal(report.metrics.revenue, 1000000);
  assert.equal(report.metrics.operationalCost, 200000);
  assert.equal(report.metrics.netProfit, 800000);
  assert.equal(report.metrics.transactionCount, 2);
  assert.equal(report.isFinal, true);
  assert.equal(report.comparison.revenue.direction, 'up');
  assert.ok(report.pdf.includes('%PDF'));
  assert.ok(report.pdf.includes('Laporan Bulanan'));
  assert.ok(report.pdf.includes('Total Pendapatan'));
  assert.ok(report.pdf.includes('Jumlah Transaksi'));
  assert.ok(report.pdf.includes('Biaya Operasional'));
  assert.ok(report.pdf.includes('Laba Bersih'));
  assert.ok(report.pdf.includes('Rp1.000.000'));
  assert.ok(report.pdf.includes('Rp200.000'));
  assert.ok(report.pdf.includes('Rp800.000'));
  assert.ok(report.pdf.includes('Grafik Tren'));
});

test('report with no transactions has zero values and no activity message', () => {
  const system = createMonthlyReportSystem({
    now: fixedNow('2026-02-02T01:00:00+07:00'),
  });
  const report = system.generateReport('2026-01');
  assert.equal(report.metrics.transactionCount, 0);
  assert.equal(report.metrics.revenue, 0);
  assert.equal(report.metrics.operationalCost, 0);
  assert.equal(report.metrics.netProfit, 0);
  assert.ok(report.pdf.includes('tidak ada aktivitas'));
});

test('report shows data belum final when closing is not final', () => {
  const system = createMonthlyReportSystem({
    now: fixedNow('2026-02-02T01:00:00+07:00'),
  });
  system.recordTransaction({
    id: 't1',
    date: '2026-01-05',
    amount: 100,
    type: 'revenue',
    recordedAt: '2026-01-05T10:00:00+07:00',
  });
  const report = system.generateReport('2026-01');
  assert.equal(report.isFinal, false);
  assert.ok(report.pdf.includes('data belum final'));
});

test('generateReport is idempotent for the same period', () => {
  const system = createMonthlyReportSystem({
    now: fixedNow('2026-02-02T01:00:00+07:00'),
  });
  const first = system.generateReport('2026-01');
  const second = system.generateReport('2026-01');
  assert.equal(first, second);
});

test('transactions recorded after report publication go to the next report', () => {
  let current = new Date('2026-02-02T01:00:00+07:00');
  const system = createMonthlyReportSystem({ now: () => current });

  system.recordTransaction({
    id: 't1',
    date: '2026-01-05',
    amount: 1000,
    type: 'revenue',
    recordedAt: '2026-01-05T10:00:00+07:00',
  });
  const january = system.generateReport('2026-01');
  assert.equal(january.metrics.revenue, 1000);

  system.recordTransaction({
    id: 't2',
    date: '2026-01-31',
    amount: 500,
    type: 'revenue',
    recordedAt: '2026-02-03T10:00:00+07:00',
  });

  assert.equal(system.getReport('2026-01').metrics.revenue, 1000);

  current = new Date('2026-02-03T11:00:00+07:00');
  const february = system.generateReport('2026-02');
  assert.equal(february.metrics.revenue, 500);
  assert.equal(february.metrics.transactionCount, 1);
});

test('recipient changes apply to the next report', () => {
  const sent = [];
  const mailer = { send: (message) => sent.push(message) };
  const system = createMonthlyReportSystem({
    now: fixedNow('2026-02-02T01:00:00+07:00'),
    mailer,
  });

  system.addRecipient('finance@example.com');
  const january = system.generateReport('2026-01');
  assert.deepEqual(january.recipients, ['finance@example.com']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'finance@example.com');

  system.addRecipient('manager@example.com');
  system.removeRecipient('finance@example.com');
  const february = system.generateReport('2026-02');
  assert.deepEqual(february.recipients, ['manager@example.com']);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].to, 'manager@example.com');
});

test('generateDueReports generates previous month on first working day', () => {
  const system = createMonthlyReportSystem({
    now: fixedNow('2026-02-02T01:00:00+07:00'),
  });
  system.recordTransaction({
    id: 't1',
    date: '2026-01-05',
    amount: 100,
    type: 'revenue',
    recordedAt: '2026-01-05T10:00:00+07:00',
  });
  const generated = system.generateDueReports();
  assert.equal(generated.length, 1);
  assert.equal(generated[0].period, '2026-01');
});

test('generateDueReports returns empty on non-first working day', () => {
  const system = createMonthlyReportSystem({
    now: fixedNow('2026-02-03T01:00:00+07:00'),
  });
  assert.deepEqual(system.generateDueReports(), []);
});

test('dashboard view includes reports, download urls, and recipients', () => {
  const system = createMonthlyReportSystem({
    now: fixedNow('2026-02-02T01:00:00+07:00'),
  });
  system.addRecipient('finance@example.com');
  system.generateReport('2026-01');
  const view = system.getDashboardViewModel();
  assert.equal(view.reports.length, 1);
  assert.equal(view.reports[0].downloadUrl, '/reports/2026-01.pdf');
  assert.ok(Buffer.isBuffer(view.reports[0].pdf));
  assert.deepEqual(view.recipients, ['finance@example.com']);
});

test('comparison uses previous report values', () => {
  const system = createMonthlyReportSystem({
    now: fixedNow('2026-03-02T01:00:00+07:00'),
  });
  system.recordTransaction({
    id: 'j1',
    date: '2026-01-05',
    amount: 1000,
    type: 'revenue',
    recordedAt: '2026-01-05T10:00:00+07:00',
  });
  system.recordTransaction({
    id: 'f1',
    date: '2026-02-05',
    amount: 1500,
    type: 'revenue',
    recordedAt: '2026-02-05T10:00:00+07:00',
  });
  system.generateReport('2026-01');
  const february = system.generateReport('2026-02');
  assert.equal(february.comparison.revenue.previous, 1000);
  assert.equal(february.comparison.revenue.direction, 'up');
  assert.ok(february.pdf.includes('Naik'));
});

test('generateMonthlyReport convenience function works', () => {
  const report = generateMonthlyReport(
    [
      {
        id: 't1',
        date: '2026-01-05',
        amount: 500,
        type: 'revenue',
        recordedAt: '2026-01-05T10:00:00+07:00',
      },
    ],
    {
      now: fixedNow('2026-02-02T01:00:00+07:00'),
      period: '2026-01',
    }
  );
  assert.equal(report.metrics.revenue, 500);
});

test('getReportPdf returns the generated pdf', () => {
  const system = createMonthlyReportSystem({
    now: fixedNow('2026-02-02T01:00:00+07:00'),
  });
  system.generateReport('2026-01');
  assert.ok(Buffer.isBuffer(system.getReportPdf('2026-01')));
  assert.equal(system.getReportPdf('2026-02'), null);
});

test('markClosingFinal marks period as final', () => {
  const system = createMonthlyReportSystem({
    now: fixedNow('2026-02-02T01:00:00+07:00'),
  });
  system.markClosingFinal('2026-01');
  assert.equal(system.isClosingFinal('2026-01'), true);
});
