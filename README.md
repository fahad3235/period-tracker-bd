# Period Tracker BD

Private, offline menstrual cycle tracker for Bangladesh — bilingual EN/বাংলা, zero network requests, all data stays in your browser's localStorage.

![status](https://img.shields.io/badge/status-complete-brightgreen)
![tests](https://img.shields.io/badge/tests-37%20unit%20%2B%2045%20smoke-passing)
![offline](https://img.shields.io/badge/network-zero%20requests-blue)

## Problem

Period-tracking apps usually need an account, sync your most private health data to a server, and are English-only. Many Bangladeshi users want a simple, private, Bangla-friendly tracker that works fully offline on a shared or low-end phone.

## Features

- **Period log** — add a period with start date and optional end date (leave blank while it is still going). Inline validation rejects future dates, end-before-start, periods longer than 14 days, and overlaps — including overlaps with an ongoing period.
- **Predictions** — next period date with a days-left countdown, fertile window, and estimated ovulation day. Averages come from your own logged periods (cycle gaps of 15–45 days only; missed logs are excluded as outliers). With fewer than 2 logged periods the standard 28-day cycle is used and clearly labelled as a default.
- **Cycle calendar** — Saturday-first month grid (Bangladesh week) marking logged period days, predicted period days, fertile days, and ovulation day. Tap any day to log symptoms for it.
- **Daily log** — flow level (none / light / medium / heavy), 7 symptoms (cramps, headache, fatigue, bloating, backache, mood swings, acne), and a short note per day.
- **Stats** — average cycle length, average period length, periods logged, plus a note saying whether the averages are yours or the 28-day default.
- **Data** — JSON export, strict import validation (wrong app, bad dates, overlapping periods, bad daily entries all rejected with your data intact), and typed-`DELETE` erase-all.
- **Bilingual** — full EN/বাংলা toggle, persisted, with Bengali digits. Works at 390px mobile width with no horizontal overflow.

## How the math works (estimates, not medical advice)

- A cycle runs from one period **start** to the next period **start**.
- Average cycle = mean of the gaps between consecutive logged starts, using only gaps of 15–45 days. Default: 28 days.
- Average period = mean of logged period lengths. Default: 5 days.
- Ovulation ≈ next period start − 14 days (standard luteal-phase estimate).
- Fertile window ≈ ovulation − 5 days … ovulation + 1 day.
- All date math uses UTC day numbers, so timezones and DST can never shift a date.

## Stack

Vanilla HTML/CSS/JS — no frameworks, no build step, no dependencies, no network calls. Open `index.html` in any modern browser.

## Install & run

```bash
# No install needed. Serve locally (any static server) or open the file:
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Testing

```bash
node tests/logic.test.js   # 37/37 unit tests (plain node assert, no deps)
node smoke/smoke.mjs       # 45/45 headless-Chrome checks (raw CDP, headless_shell)
```

The smoke test runs against `index.html?asof=2026-11-07` so every date is deterministic. It covers: empty state, logging two periods (2026-10-08…12 and 2026-11-05 ongoing), the exact predictions (next period 2026-12-03, 26 days away; fertile 2026-11-14…20; ovulation 2026-11-19), calendar marking, overlap/future validation, daily-log save, reload persistence, EN→বাংলা toggle + persistence, the erase flow, 390px overflow, and zero console errors/page exceptions. See `TEST_RESULTS.md` for the hand-verified numbers.

## Project structure

```
index.html        UI shell (pure ASCII; all strings come from i18n)
style.css         Warm rose/green palette, mobile-first
js/logic.js       Pure cycle math + validation (Node + browser)
js/i18n.js        EN/বাংলা strings (generated; Bengali as \uXXXX escapes)
js/app.js         UI wiring, localStorage state
gen_i18n.py       Generator for js/i18n.js (the only file with raw Bengali)
tests/logic.test.js
smoke/smoke.mjs
```

## Limitations

- Predictions are statistical estimates from your own data, not a diagnosis and not contraception: ovulation varies, and the 14-day luteal-phase rule is an average, not a guarantee.
- Cycle gaps outside 15–45 days are excluded from the average (treated as missed logging).
- Ongoing periods are shown up to today, capped at 14 days.
- Data lives only in this browser's localStorage — clearing browser data erases it. Export a JSON backup from the Data tab.
- This is a personal tracker, not a medical device. See a doctor for irregular cycles, very heavy bleeding, or severe pain.

## Status

Complete. 37/37 unit tests and 45/45 headless-Chrome smoke checks pass with 0 console errors. See `TEST_RESULTS.md`.
