# TEST RESULTS — Period Tracker BD (run #260, 2026-11-07, 11:00 slot)

## Unit tests — 37/37 PASS

Run: `node tests/logic.test.js` (plain node assert, no deps).

Hand-verified expectations (all asserted in the test file):
- Date parsing: `2026-11-07` valid; `2026-02-29` rejected (not a leap year); `2024-02-29` accepted; bad month/day/format rejected; `2026-12-31 + 1 day = 2027-01-01`.
- Validation (today fixed 2026-11-07): future start/end rejected; end-before-start rejected; 15-day period rejected, 14-day accepted; overlap with a logged period rejected; overlap with an **ongoing** period rejected (this was a real bug found by the smoke test — fixed, regression test added); invalid date rejected.
- Cycle math (periods 2026-09-10, 2026-10-08, 2026-11-05): gaps `[28, 28]`; avg cycle 28 (n=2, from data); fallback 28 with <2 periods; a 60-day gap excluded as an outlier (avg still 28, n=1); all-outlier gaps → fallback 28.
- Period length: 5,5,5 → 5; 5,6,4 → 5; no ended periods → fallback 5.
- Predictions (last start 2026-11-05, cycle 28, today 2026-11-07): next period **2026-12-03**, 26 days away, ends 2026-12-07; ovulation **2026-11-19** (start − 14); fertile window **2026-11-14…2026-11-20** (ovulation −5…+1); 3 cycles step 2026-12-03 → 2026-12-31 → 2027-01-28; daysUntil 0 on the expected day, −2 two days late; empty history → no predictions.
- Calendar classification: logged day → `period`; predicted day → `predicted`; ovulation → `ovulation`; fertile days → `fertile`; days outside windows → null; a logged period wins over a prediction on the same day.
- Stats: total 3, shortest/longest 28, irregular=false; gaps 28 vs 37 (range 9 > 7) → irregular=true.
- Daily log: valid entry accepted; future date rejected; unknown flow/symptom rejected.
- Import: well-formed export accepted; wrong app / wrong version / missing arrays / bad date rejected; overlapping periods in file rejected; bad daily entry rejected.

Repairs: 1 real app bug fixed — `validatePeriod` treated an ongoing period's end as its start day, so a date inside an ongoing period was not detected as an overlap. Now an ongoing period extends to today for overlap checks. (Found by the smoke test; regression test added.)

## Headless-Chrome smoke — 45/45 PASS

Run: `node smoke/smoke.mjs` (raw CDP, headless_shell, `index.html?asof=2026-11-07`).

- Static render: title, 3 dashboard cards, empty-state messages, 30 November day cells, "November 2026" title, "not medical advice" disclaimer, 3 tabs, 7 symptom checkboxes.
- Logging: 2026-10-08…12 saved (1 history row), then 2026-11-05 ongoing (2 rows); next period 2026-12-03, "26 days left"; fertile 2026-11-14 – 2026-11-20; ovulation 2026-11-19; stats avg cycle 28, avg period 5, total 2.
- Calendar: 3 period cells (Nov 5, 6, 7 — ongoing shown to today), 1 ovulation cell (Nov 19), 6 fertile cells (Nov 14–18, 20); today marked Nov 7; December view shows 5 predicted cells (Dec 3–7); back-navigation returns to November.
- Validation: overlapping 2026-11-06 rejected with "overlap" message, history stays at 2 rows; future start 2026-11-08 rejected with "future" message.
- Daily log: clicking Nov 6 switches to the Log tab with the date prefilled; saving flow=Medium + cramps + note "mild" renders one logged-day row with all three.
- Persistence: state in localStorage (2 periods); after reload history still 2 rows and prediction still 2026-12-03.
- Language: toggle → Bengali title "পিরিয়ড ট্র্যাকার বিডি", `lang="bn"`, next period shows Bengali digits ২৬; persists after reload; toggles back to English.
- Erase: wrong word rejected ("DELETE" hint shown), data intact; typing DELETE erases periods + daily logs, history empty again.
- Mobile: no horizontal overflow at 390px (scrollWidth ≤ 391).
- Zero console errors, zero page exceptions.

Smoke repairs: 0 app bugs in the smoke run itself (the 1 overlap bug above was caught by the smoke run's first pass and fixed before the green run).

## Source hygiene

- `grep -P '[^\x00-\x7F]'` over `index.html`, `style.css`, `js/*.js`, `tests/*.js`, `smoke/*.js`: zero non-ASCII matches (Bengali lives only in `gen_i18n.py`, emitted as `\uXXXX` escapes into `js/i18n.js`).
- Zero network requests by design (static files only; verified by the smoke run's console/exception monitoring and by inspection — no fetch/XHR in the app code).
