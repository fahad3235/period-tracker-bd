// Period Tracker BD - logic unit tests. Plain node assert, no deps.
// Run: node tests/logic.test.js
const assert = require('assert');
const L = require('../js/logic');

let n = 0;
function check(name, fn) { n += 1; fn(); console.log('ok - ' + name); }

// --- date parsing ---
check('parseDate accepts a valid date', () => {
  assert.strictEqual(L.fmtDay(L.parseDate('2026-11-07')), '2026-11-07');
});
check('parseDate rejects Feb 29 in a non-leap year', () => {
  assert.strictEqual(L.parseDate('2026-02-29'), null);
});
check('parseDate accepts Feb 29 in a leap year', () => {
  assert.strictEqual(L.fmtDay(L.parseDate('2024-02-29')), '2024-02-29');
});
check('parseDate rejects bad month, bad day, bad format', () => {
  assert.strictEqual(L.parseDate('2026-13-01'), null);
  assert.strictEqual(L.parseDate('2026-11-32'), null);
  assert.strictEqual(L.parseDate('2026-11-7'), null);
  assert.strictEqual(L.parseDate('07/11/2026'), null);
  assert.strictEqual(L.parseDate(''), null);
  assert.strictEqual(L.parseDate(null), null);
});
check('fmtDay round-trips across a year boundary', () => {
  assert.strictEqual(L.fmtDay(L.parseDate('2026-12-31') + 1), '2027-01-01');
});

// --- period validation (today fixed at 2026-11-07) ---
const TODAY = L.parseDate('2026-11-07');
const EXISTING = [{ start: '2026-10-08', end: '2026-10-12' }, { start: '2026-11-05', end: null }];

check('validatePeriod accepts a normal new period', () => {
  assert.strictEqual(L.validatePeriod('2026-09-10', '2026-09-14', EXISTING, TODAY), 'ok');
});
check('validatePeriod accepts an ongoing period (no end)', () => {
  assert.strictEqual(L.validatePeriod('2026-09-10', '', [], TODAY), 'ok');
});
check('validatePeriod rejects a future start', () => {
  assert.strictEqual(L.validatePeriod('2026-11-08', '', [], TODAY), 'errFuture');
});
check('validatePeriod rejects a future end', () => {
  assert.strictEqual(L.validatePeriod('2026-11-05', '2026-11-08', [], TODAY), 'errFuture');
});
check('validatePeriod rejects end before start', () => {
  assert.strictEqual(L.validatePeriod('2026-11-05', '2026-11-04', [], TODAY), 'errEndBeforeStart');
});
check('validatePeriod rejects a period longer than 14 days', () => {
  assert.strictEqual(L.validatePeriod('2026-10-01', '2026-10-15', [], TODAY), 'errTooLong');
  assert.strictEqual(L.validatePeriod('2026-10-01', '2026-10-14', [], TODAY), 'ok');
});
check('validatePeriod rejects overlap with a logged period', () => {
  assert.strictEqual(L.validatePeriod('2026-10-10', '2026-10-11', EXISTING, TODAY), 'errOverlap');
  assert.strictEqual(L.validatePeriod('2026-10-12', '2026-10-13', EXISTING, TODAY), 'errOverlap');
  assert.strictEqual(L.validatePeriod('2026-10-13', '2026-10-14', EXISTING, TODAY), 'ok');
});
check('validatePeriod rejects overlap with an ongoing period', () => {
  assert.strictEqual(L.validatePeriod('2026-11-06', '2026-11-06', EXISTING, TODAY), 'errOverlap');
  assert.strictEqual(L.validatePeriod('2026-11-07', '', EXISTING, TODAY), 'errOverlap');
});
check('validatePeriod rejects an invalid date', () => {
  assert.strictEqual(L.validatePeriod('2026-02-29', '', [], TODAY), 'errInvalidDate');
});

// --- cycle math ---
const THREE = [
  { start: '2026-09-10', end: '2026-09-14' },
  { start: '2026-10-08', end: '2026-10-12' },
  { start: '2026-11-05', end: '2026-11-09' },
];
check('cycleGaps is 28, 28 for three 28-day-apart periods', () => {
  assert.deepStrictEqual(L.cycleGaps(THREE), [28, 28]);
});
check('avgCycle is 28 from data with n=2', () => {
  assert.deepStrictEqual(L.avgCycle(THREE), { value: 28, fromData: true, n: 2 });
});
check('avgCycle falls back to 28 with fewer than 2 periods', () => {
  assert.deepStrictEqual(L.avgCycle([THREE[0]]), { value: 28, fromData: false, n: 0 });
  assert.deepStrictEqual(L.avgCycle([]), { value: 28, fromData: false, n: 0 });
});
check('avgCycle excludes out-of-range gaps (60d missed log)', () => {
  const odd = [
    { start: '2026-08-10', end: '2026-08-14' },
    { start: '2026-10-09', end: '2026-10-13' }, // 60-day gap
    { start: '2026-11-06', end: '2026-11-10' }, // 28-day gap
  ];
  assert.deepStrictEqual(L.avgCycle(odd), { value: 28, fromData: true, n: 1 });
  assert.deepStrictEqual(L.avgCycle([
    { start: '2026-08-10', end: '2026-08-14' },
    { start: '2026-10-09', end: '2026-10-13' },
  ]), { value: 28, fromData: false, n: 0 });
});
check('avgPeriodLen averages 5, 5, 5 to 5; 5,6,4 to 5', () => {
  assert.deepStrictEqual(L.avgPeriodLen(THREE), { value: 5, fromData: true, n: 3 });
  assert.deepStrictEqual(L.avgPeriodLen([
    { start: '2026-09-10', end: '2026-09-14' },
    { start: '2026-10-08', end: '2026-10-13' },
    { start: '2026-11-05', end: '2026-11-08' },
  ]), { value: 5, fromData: true, n: 3 });
});
check('avgPeriodLen falls back to 5 when no period has an end', () => {
  assert.deepStrictEqual(L.avgPeriodLen([{ start: '2026-11-05', end: null }]),
    { value: 5, fromData: false, n: 0 });
});

// --- predictions (last start 2026-11-05, cycle 28, today 2026-11-07) ---
check('predictions: next period 2026-12-03, 26 days away', () => {
  const p = L.predictions(THREE, TODAY, 1);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(L.fmtDay(p[0].start), '2026-12-03');
  assert.strictEqual(L.fmtDay(p[0].end), '2026-12-07');
  assert.strictEqual(p[0].daysUntil, 26);
});
check('predictions: ovulation is start minus 14 days', () => {
  const p = L.predictions(THREE, TODAY, 1);
  assert.strictEqual(L.fmtDay(p[0].ovulation), '2026-11-19');
});
check('predictions: fertile window is ovulation -5 to +1', () => {
  const p = L.predictions(THREE, TODAY, 1);
  assert.strictEqual(L.fmtDay(p[0].fertileStart), '2026-11-14');
  assert.strictEqual(L.fmtDay(p[0].fertileEnd), '2026-11-20');
});
check('predictions: three cycles step by the cycle length', () => {
  const p = L.predictions(THREE, TODAY, 3);
  assert.strictEqual(L.fmtDay(p[1].start), '2026-12-31');
  assert.strictEqual(L.fmtDay(p[2].start), '2027-01-28');
});
check('predictions: empty history returns no predictions', () => {
  assert.deepStrictEqual(L.predictions([], TODAY, 3), []);
});
check('predictions: daysUntil is 0 on the expected day, negative after', () => {
  const p = L.predictions(THREE, L.parseDate('2026-12-03'), 1);
  assert.strictEqual(p[0].daysUntil, 0);
  const late = L.predictions(THREE, L.parseDate('2026-12-05'), 1);
  assert.strictEqual(late[0].daysUntil, -2);
});

// --- calendar classification ---
check('classifyDay marks logged period days', () => {
  const preds = L.predictions(THREE, TODAY, 3);
  assert.strictEqual(L.classifyDay(L.parseDate('2026-10-10'), THREE, preds), 'period');
  assert.strictEqual(L.classifyDay(L.parseDate('2026-10-13'), THREE, preds), null);
});
check('classifyDay marks predicted period, ovulation, fertile days', () => {
  const preds = L.predictions(THREE, TODAY, 3);
  assert.strictEqual(L.classifyDay(L.parseDate('2026-12-03'), THREE, preds), 'predicted');
  assert.strictEqual(L.classifyDay(L.parseDate('2026-11-19'), THREE, preds), 'ovulation');
  assert.strictEqual(L.classifyDay(L.parseDate('2026-11-14'), THREE, preds), 'fertile');
  assert.strictEqual(L.classifyDay(L.parseDate('2026-11-20'), THREE, preds), 'fertile');
  assert.strictEqual(L.classifyDay(L.parseDate('2026-11-13'), THREE, preds), null);
  assert.strictEqual(L.classifyDay(L.parseDate('2026-11-21'), THREE, preds), null);
});
check('classifyDay prefers a logged period over a prediction', () => {
  const overlapping = [{ start: '2026-12-03', end: '2026-12-07' }];
  const preds = L.predictions(THREE, TODAY, 3);
  assert.strictEqual(L.classifyDay(L.parseDate('2026-12-04'), overlapping, preds), 'period');
});

// --- stats ---
check('stats: totals, shortest/longest, regularity flag', () => {
  const s = L.stats(THREE);
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.shortest, 28);
  assert.strictEqual(s.longest, 28);
  assert.strictEqual(s.irregular, false);
  const irregular = L.stats([
    { start: '2026-08-01', end: '2026-08-05' },
    { start: '2026-08-29', end: '2026-09-02' }, // 28
    { start: '2026-10-05', end: '2026-10-09' }, // 37 -> range 9 > 7
  ]);
  assert.strictEqual(irregular.irregular, true);
});

// --- daily log validation ---
check('validateDaily accepts a normal entry', () => {
  assert.strictEqual(L.validateDaily('2026-11-06', 'medium', ['cramps', 'mood'], TODAY), 'ok');
});
check('validateDaily rejects a future date', () => {
  assert.strictEqual(L.validateDaily('2026-11-08', 'light', [], TODAY), 'errFutureDaily');
});
check('validateDaily rejects unknown flow or symptom', () => {
  assert.strictEqual(L.validateDaily('2026-11-06', 'torrential', [], TODAY), 'errInvalidDate');
  assert.strictEqual(L.validateDaily('2026-11-06', 'light', ['unicorn'], TODAY), 'errInvalidDate');
});

// --- import validation ---
check('validateImport accepts a well-formed export', () => {
  const r = L.validateImport({ app: 'period-tracker-bd', version: 1, periods: THREE, daily: [
    { date: '2026-11-06', flow: 'medium', symptoms: ['cramps'], note: 'ok' },
  ]});
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.periods.length, 3);
});
check('validateImport rejects wrong app, missing arrays, bad periods', () => {
  assert.strictEqual(L.validateImport({ app: 'other', version: 1, periods: [], daily: [] }).ok, false);
  assert.strictEqual(L.validateImport({ app: 'period-tracker-bd', version: 2, periods: [], daily: [] }).ok, false);
  assert.strictEqual(L.validateImport({ app: 'period-tracker-bd', version: 1 }).ok, false);
  assert.strictEqual(L.validateImport({ app: 'period-tracker-bd', version: 1, periods: [{ start: '2026-02-29' }], daily: [] }).ok, false);
});
check('validateImport rejects overlapping periods in the file', () => {
  const r = L.validateImport({ app: 'period-tracker-bd', version: 1, periods: [
    { start: '2026-10-08', end: '2026-10-12' },
    { start: '2026-10-11', end: '2026-10-13' },
  ], daily: [] });
  assert.strictEqual(r.ok, false);
});
check('validateImport rejects a bad daily entry', () => {
  const r = L.validateImport({ app: 'period-tracker-bd', version: 1, periods: [], daily: [
    { date: '2026-11-06', flow: 'light', symptoms: ['nope'] },
  ]});
  assert.strictEqual(r.ok, false);
});

console.log('LOGIC PASS: ' + n + '/' + n);
