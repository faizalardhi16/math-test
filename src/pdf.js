'use strict';

const { formatIDR } = require('./idr');
const { createLogger } = require('./logger');

const logger = createLogger();

function escapePdfString(value) {
  const bs = String.fromCharCode(92);
  const open = String.fromCharCode(40);
  const close = String.fromCharCode(41);
  return String(value)
    .split(bs).join(bs + bs)
    .split(open).join(bs + open)
    .split(close).join(bs + close);
}

function text(content, x, y, size = 10) {
  return `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfString(content)}) Tj ET\n`;
}

function line(x1, y1, x2, y2, width = 1) {
  return `${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function polyline(points, width = 1) {
  if (!points || points.length < 2) return '';
  let cmd = `${width} w ${points[0][0]} ${points[0][1]} m `;
  for (let i = 1; i < points.length; i++) {
    cmd += `${points[i][0]} ${points[i][1]} l `;
  }
  cmd += 'S\n';
  return cmd;
}

function buildPdf(objects) {
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function formatDateTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}

function directionLabel(direction) {
  if (direction === 'up') return 'Naik';
  if (direction === 'down') return 'Turun';
  return 'Tetap';
}

function drawChart(lines, daily) {
  const left = 70;
  const right = 550;
  const bottom = 100;
  const top = 300;
  const midY = (bottom + top) / 2;

  lines.push(line(left, midY, right, midY, 0.5));
  lines.push(line(left, bottom, left, top, 0.5));
  lines.push(line(left, bottom, right, bottom, 0.5));

  if (!daily || daily.length === 0) {
    return;
  }

  const values = [];
  for (const day of daily) {
    values.push(Math.abs(day.revenue || 0));
    values.push(Math.abs(day.netProfit || 0));
  }
  const maxAbs = Math.max(1, ...values);
  const n = daily.length;
  const xFor = (i) => (n === 1 ? (left + right) / 2 : left + (i / (n - 1)) * (right - left));
  const yFor = (value) => midY + (value / maxAbs) * (top - midY);

  const revenuePoints = daily.map((day, i) => [xFor(i), yFor(day.revenue || 0)]);
  const profitPoints = daily.map((day, i) => [xFor(i), yFor(day.netProfit || 0)]);

  lines.push(polyline(revenuePoints, 1));
  lines.push(polyline(profitPoints, 1));
  lines.push(text(`Skala: ${formatIDR(maxAbs)}`, left, top - 8, 7));
}

function buildMonthlyReportPdf(report) {
  const lines = [];
  const metrics = report.metrics || {};
  const comparison = report.comparison || {};

  lines.push(text('Laporan Bulanan', 50, 800, 18));
  lines.push(text(`Periode: ${report.period}`, 50, 780, 12));
  lines.push(text(`Diterbitkan: ${formatDateTime(report.publishedAt)}`, 50, 765, 9));
  lines.push(text(`Status: ${report.isFinal ? 'Final' : 'Belum final'}`, 50, 750, 10));

  if (!report.isFinal) {
    lines.push(text('Catatan: data belum final', 50, 735, 10));
  }
  if (!metrics.transactionCount) {
    lines.push(text('Catatan: tidak ada aktivitas', 50, 720, 10));
  }

  let y = 690;
  lines.push(text('Metrik', 50, y, 10));
  lines.push(text('Bulan Ini', 220, y, 10));
  lines.push(text('Bulan Lalu', 340, y, 10));
  lines.push(text('Indikator', 460, y, 10));
  y -= 16;

  const prev = comparison.previous || {};
  const rows = [
    ['Total Pendapatan', formatIDR(metrics.revenue || 0), formatIDR(prev.revenue || 0), directionLabel(comparison.revenue && comparison.revenue.direction)],
    ['Jumlah Transaksi', String(metrics.transactionCount || 0), String(prev.transactionCount || 0), directionLabel(comparison.transactionCount && comparison.transactionCount.direction)],
    ['Biaya Operasional', formatIDR(metrics.operationalCost || 0), formatIDR(prev.operationalCost || 0), directionLabel(comparison.operationalCost && comparison.operationalCost.direction)],
    ['Laba Bersih', formatIDR(metrics.netProfit || 0), formatIDR(prev.netProfit || 0), directionLabel(comparison.netProfit && comparison.netProfit.direction)],
  ];

  for (const row of rows) {
    lines.push(text(row[0], 50, y, 10));
    lines.push(text(row[1], 220, y, 10));
    lines.push(text(row[2], 340, y, 10));
    lines.push(text(row[3], 460, y, 10));
    y -= 16;
  }

  y -= 10;
  lines.push(text('Grafik Tren Pendapatan & Laba Bersih', 50, y, 12));
  y -= 14;
  lines.push(text('-- Pendapatan', 70, y, 8));
  lines.push(text('-- Laba Bersih', 170, y, 8));
  y -= 8;
  lines.push(line(70, y, 120, y, 1));
  lines.push(line(170, y, 220, y, 1));

  drawChart(lines, metrics.daily || []);

  const recipients = report.recipients || [];
  lines.push(text(`Dikirim ke: ${recipients.join(', ') || '-'}`, 50, 50, 8));

  const content = lines.join('');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
  ];
  return buildPdf(objects);
}

module.exports = {
  buildMonthlyReportPdf: logger.wrap(buildMonthlyReportPdf, { name: 'buildMonthlyReportPdf' }),
  generateMonthlyReportPdf: logger.wrap(buildMonthlyReportPdf, { name: 'buildMonthlyReportPdf' }),
  buildPdf: logger.wrap(buildPdf, { name: 'buildPdf' }),
  escapePdfString: logger.wrap(escapePdfString, { name: 'escapePdfString' }),
};
