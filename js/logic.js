// Period Tracker BD - pure cycle logic (no DOM). Node + browser compatible.
// All dates are ISO YYYY-MM-DD strings; math is done in UTC day numbers
// so timezones and DST can never shift a date by one day.
//
// Conventions (documented, standard estimates):
// - A cycle runs from one period START to the next period START.
// - Default cycle length 28 days, default period length 5 days.
// - Ovulation is estimated as next period start minus 14 days (luteal phase).
// - Fertile window is ovulation - 5 days .. ovulation + 1 day.
// - Averages use only cycle gaps of 15-45 days; anything outside is treated
//   as an outlier (missed logging, not a real cycle) and excluded. If no gap
//   qualifies, the 28-day default is used.

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CYCLE = 28;
const DEFAULT_PERIOD = 5;
const LUTEAL = 14;
const FERTILE_BEFORE = 5;
const FERTILE_AFTER = 1;
const MAX_PERIOD_DAYS = 14;
const MIN_CYCLE_GAP = 15;
const MAX_CYCLE_GAP = 45;

function parseDate(str) {
  // Strict YYYY-MM-DD -> UTC day number, or null.
  if (typeof str !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return Math.floor(t / DAY_MS);
}

function fmtDay(dayNum) {
  const dt = new Date(dayNum * DAY_MS);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return y + '-' + mo + '-' + d;
}

function todayDay() {
  const now = new Date();
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / DAY_MS);
}

function isValidPeriod(p) {
  if (!p || typeof p !== 'object') return false;
  const s = parseDate(p.start);
  if (s === null) return false;
  if (p.end === null || p.end === undefined || p.end === '') return true; // ongoing
  const e = parseDate(p.end);
  if (e === null) return false;
  return e >= s;
}

// Validate adding a period. Returns an error key ('ok' when fine).
// today: UTC day number.
function validatePeriod(startStr, endStr, periods, today) {
  const s = parseDate(startStr);
  if (s === null) return 'errInvalidDate';
  if (s > today) return 'errFuture';
  let e = null;
  if (endStr) {
    e = parseDate(endStr);
    if (e === null) return 'errInvalidDate';
    if (e < s) return 'errEndBeforeStart';
    if (e - s + 1 > MAX_PERIOD_DAYS) return 'errTooLong';
    if (e > today) return 'errFuture';
  }
  const end = e === null ? s : e;
  for (const p of periods) {
    const ps = parseDate(p.start);
    // An ongoing period (no end) extends to today for overlap purposes.
    const pe = p.end ? parseDate(p.end) : today;
    if (ps === null || pe === null) continue;
    // Overlap if ranges intersect.
    if (s <= pe && ps <= end) return 'errOverlap';
  }
  return 'ok';
}

function sortPeriods(periods) {
  return periods.slice().sort((a, b) => parseDate(a.start) - parseDate(b.start));
}

// Gaps (in days) between consecutive period starts, oldest first.
function cycleGaps(periods) {
  const sorted = sortPeriods(periods);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(parseDate(sorted[i].start) - parseDate(sorted[i - 1].start));
  }
  return gaps;
}

function avgCycle(periods) {
  const gaps = cycleGaps(periods).filter((g) => g >= MIN_CYCLE_GAP && g <= MAX_CYCLE_GAP);
  if (gaps.length === 0) return { value: DEFAULT_CYCLE, fromData: false, n: 0 };
  const sum = gaps.reduce((a, b) => a + b, 0);
  return { value: Math.round(sum / gaps.length), fromData: true, n: gaps.length };
}

function avgPeriodLen(periods) {
  const lens = [];
  for (const p of periods) {
    if (!p.end) continue;
    const s = parseDate(p.start), e = parseDate(p.end);
    if (s === null || e === null) continue;
    lens.push(e - s + 1);
  }
  if (lens.length === 0) return { value: DEFAULT_PERIOD, fromData: false, n: 0 };
  const sum = lens.reduce((a, b) => a + b, 0);
  return { value: Math.round(sum / lens.length), fromData: true, n: lens.length };
}

// Next `count` predicted cycles from the last logged period start.
function predictions(periods, today, count) {
  const c = count || 3;
  if (!periods || periods.length === 0) return [];
  const sorted = sortPeriods(periods);
  const lastStart = parseDate(sorted[sorted.length - 1].start);
  const cycle = avgCycle(periods).value;
  const plen = avgPeriodLen(periods).value;
  const out = [];
  for (let i = 1; i <= c; i++) {
    const start = lastStart + cycle * i;
    const ovulation = start - LUTEAL;
    out.push({
      start: start,
      end: start + plen - 1,
      ovulation: ovulation,
      fertileStart: ovulation - FERTILE_BEFORE,
      fertileEnd: ovulation + FERTILE_AFTER,
      daysUntil: start - today,
    });
  }
  return out;
}

// Classify one day for the calendar: 'period' | 'predicted' | 'fertile' |
// 'ovulation' | null. Logged periods win over predictions.
function classifyDay(dayNum, periods, preds) {
  for (const p of periods) {
    const s = parseDate(p.start);
    const e = p.end ? parseDate(p.end) : s;
    if (s !== null && e !== null && dayNum >= s && dayNum <= e) return 'period';
    // Ongoing period (no end): mark start day + following 4 days as period
    // only up to today; handled by caller passing an end. Fallback: start day only.
    if (s !== null && !p.end && dayNum === s) return 'period';
  }
  for (const pr of preds) {
    if (dayNum === pr.ovulation) return 'ovulation';
    if (dayNum >= pr.fertileStart && dayNum <= pr.fertileEnd) return 'fertile';
    if (dayNum >= pr.start && dayNum <= pr.end) return 'predicted';
  }
  return null;
}

function stats(periods) {
  const gaps = cycleGaps(periods);
  const valid = gaps.filter((g) => g >= MIN_CYCLE_GAP && g <= MAX_CYCLE_GAP);
  return {
    total: periods.length,
    avgCycle: avgCycle(periods),
    avgPeriod: avgPeriodLen(periods),
    shortest: valid.length ? Math.min.apply(null, valid) : null,
    longest: valid.length ? Math.max.apply(null, valid) : null,
    irregular: valid.length >= 2 && (Math.max.apply(null, valid) - Math.min.apply(null, valid) > 7),
  };
}

const SYMPTOMS = ['cramps', 'headache', 'fatigue', 'bloating', 'backache', 'mood', 'acne'];
const FLOWS = ['none', 'light', 'medium', 'heavy'];

// Validate a daily log entry. Returns error key or 'ok'.
function validateDaily(dateStr, flow, symptoms, today) {
  const d = parseDate(dateStr);
  if (d === null) return 'errInvalidDate';
  if (d > today) return 'errFutureDaily';
  if (FLOWS.indexOf(flow) === -1) return 'errInvalidDate';
  if (!Array.isArray(symptoms)) return 'errInvalidDate';
  for (const s of symptoms) if (SYMPTOMS.indexOf(s) === -1) return 'errInvalidDate';
  return 'ok';
}

// Strict import validation. Returns { ok: true, data } or { ok: false, error }.
function validateImport(data) {
  if (!data || typeof data !== 'object' || data.app !== 'period-tracker-bd' || data.version !== 1) {
    return { ok: false, error: 'errBadImport' };
  }
  if (!Array.isArray(data.periods) || !Array.isArray(data.daily)) {
    return { ok: false, error: 'errBadImport' };
  }
  for (const p of data.periods) {
    if (!isValidPeriod(p)) return { ok: false, error: 'errBadImport' };
    if (p.end) {
      const s = parseDate(p.start), e = parseDate(p.end);
      if (e - s + 1 > MAX_PERIOD_DAYS) return { ok: false, error: 'errBadImport' };
    }
  }
  // No overlapping periods in the file.
  const sorted = sortPeriods(data.periods);
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].end ? parseDate(sorted[i - 1].end) : parseDate(sorted[i - 1].start);
    if (parseDate(sorted[i].start) <= prevEnd) return { ok: false, error: 'errBadImport' };
  }
  for (const d of data.daily) {
    if (!d || typeof d !== 'object') return { ok: false, error: 'errBadImport' };
    if (validateDaily(d.date, d.flow, d.symptoms, Number.MAX_SAFE_INTEGER) !== 'ok') {
      return { ok: false, error: 'errBadImport' };
    }
    if (d.note !== undefined && typeof d.note !== 'string') return { ok: false, error: 'errBadImport' };
  }
  return { ok: true, data: { periods: sorted, daily: data.daily.slice() } };
}

const LOGIC = {
  parseDate, fmtDay, todayDay, isValidPeriod, validatePeriod, sortPeriods,
  cycleGaps, avgCycle, avgPeriodLen, predictions, classifyDay, stats,
  validateDaily, validateImport, SYMPTOMS, FLOWS,
  DEFAULT_CYCLE, DEFAULT_PERIOD, LUTEAL, MAX_PERIOD_DAYS,
};

if (typeof module !== 'undefined') module.exports = LOGIC;
if (typeof window !== 'undefined') window.PTLogic = LOGIC;
