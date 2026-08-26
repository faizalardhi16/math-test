'use strict';

const monthlyReport = require('./monthly-report');
const idr = require('./idr');
const businessCalendar = require('./business-calendar');
const pdf = require('./pdf');
const weight = require('./weight');

module.exports = {
  ...monthlyReport,
  formatIDR: idr.formatIDR,
  formatRupiah: idr.formatRupiah,
  formatNumber: idr.formatNumber,
  ...businessCalendar,
  buildMonthlyReportPdf: pdf.buildMonthlyReportPdf,
  generateMonthlyReportPdf: pdf.generateMonthlyReportPdf,
  gramsToKilograms: weight.gramsToKilograms,
};
