// Period Tracker BD headless-Chrome smoke test (raw CDP, headless_shell).
// Run: node smoke/smoke.mjs  (uses ?asof=2026-11-07 for determinism)
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE = 'file://' + path.resolve(DIR, '..', 'index.html') + '?asof=2026-11-07';
const CHROME = process.env.HEADLESS_SHELL ||
  (process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell');
const PORT = 9235;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ptbd-smoke-'));

const results = [];
function check(name, cond, extra) {
  results.push([name, !!cond]);
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (extra !== undefined ? ' :: ' + extra : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await fn()) return true; } catch (e) { /* retry */ }
    await sleep(200);
  }
  throw new Error('timeout waiting for: ' + label);
}

async function main() {
  const child = spawn(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu',
    '--user-data-dir=' + PROFILE,
    '--remote-debugging-port=' + PORT, '--remote-debugging-address=127.0.0.1',
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    let version = null;
    await waitFor(async () => {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (!res.ok) return false;
      version = await res.json();
      return true;
    }, 20000, 'debugger port');
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    const consoleErrors = [];
    const exceptions = [];
    const onMsg = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        exceptions.push(msg.params.exceptionDetails.exception?.description || 'exception');
      }
    };
    ws.onmessage = onMsg;
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
    const target = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' })).json();
    const tws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { tws.onopen = res; tws.onerror = rej; });
    const tpending = new Map();
    let tid = 0;
    tws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && tpending.has(msg.id)) {
        const { res, rej } = tpending.get(msg.id);
        tpending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        exceptions.push(msg.params.exceptionDetails.exception?.description || 'exception');
      }
    };
    const tsend = (method, params) => new Promise((res, rej) => {
      const mid = ++tid;
      tpending.set(mid, { res, rej });
      tws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
    const teval = async (expr) => {
      const r = await tsend('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
      return r.result.value;
    };
    await tsend('Runtime.enable');
    await tsend('Page.enable');
    await tsend('Page.navigate', { url: PAGE });
    await waitFor(async () => (await teval('document.querySelectorAll(".cal-cell").length')) > 0, 10000, 'calendar renders');

    // 1. Static render (empty state, asof 2026-11-07).
    check('app title is Period Tracker BD', await teval('document.querySelector("h1").textContent') === 'Period Tracker BD');
    check('3 dashboard cards render', (await teval('document.querySelectorAll(".card").length')) === 3);
    check('empty state: next period asks to log a period', await teval('document.getElementById("next-period").textContent.includes("Log a period")'));
    check('empty state: history empty message', await teval('document.getElementById("history-list").textContent.includes("No periods logged yet")'));
    check('November 2026 calendar has 30 day cells', (await teval('document.querySelectorAll(".cal-cell:not(.blank)").length')) === 30);
    check('calendar title is November 2026', await teval('document.getElementById("cal-title").textContent') === 'November 2026');
    check('footer disclaimer mentions not medical advice', await teval('document.querySelector(".foot").textContent.includes("not medical advice")'));
    check('3 tabs render', (await teval('document.querySelectorAll(".tab").length')) === 3);
    check('7 symptom checkboxes render', (await teval('document.querySelectorAll(".sym-check").length')) === 7);

    // 2. Log two periods: 2026-10-08..12 and 2026-11-05 (ongoing).
    await teval('document.getElementById("period-start").value = "2026-10-08"; document.getElementById("period-end").value = "2026-10-12"; document.getElementById("period-form").requestSubmit()');
    await sleep(300);
    check('first period saved, history has 1 row', (await teval('document.querySelectorAll("#history-list .row").length')) === 1);
    await teval('document.getElementById("period-start").value = "2026-11-05"; document.getElementById("period-end").value = ""; document.getElementById("period-form").requestSubmit()');
    await sleep(300);
    check('second period saved, history has 2 rows', (await teval('document.querySelectorAll("#history-list .row").length')) === 2);
    check('next period predicted 2026-12-03', await teval('document.getElementById("next-period").textContent.includes("2026-12-03")'));
    check('next period is 26 days away', await teval('document.getElementById("next-period").textContent.includes("26 days left")'));
    check('fertile window shown 2026-11-14 - 2026-11-20', await teval('document.getElementById("fertile-window").textContent.includes("2026-11-14") && document.getElementById("fertile-window").textContent.includes("2026-11-20")'));
    check('ovulation shown 2026-11-19', await teval('document.getElementById("ovulation").textContent.includes("2026-11-19")'));
    check('stats: avg cycle 28, avg period 5, total 2', await teval('document.getElementById("stat-cycle").textContent.includes("28") && document.getElementById("stat-period").textContent.includes("5") && document.getElementById("stat-total").textContent === "2"'));

    // 3. Calendar marks: Nov 5-7 period (ongoing to today), Nov 19 ovulation, 6 fertile days.
    check('3 period cells in November view (Nov 5, 6, 7)', (await teval('document.querySelectorAll(".cal-cell.period").length')) === 3);
    check('1 ovulation cell (Nov 19)', (await teval('document.querySelectorAll(".cal-cell.ovulation").length')) === 1);
    check('6 fertile cells (Nov 14-18, 20)', (await teval('document.querySelectorAll(".cal-cell.fertile").length')) === 6);
    check('today (Nov 7) is marked', await teval('document.querySelector(".cal-cell.today") !== null && document.querySelector(".cal-cell.today").getAttribute("data-date") === "2026-11-07"'));
    await teval('document.getElementById("cal-next").click()');
    await sleep(300);
    check('next month is December 2026', await teval('document.getElementById("cal-title").textContent') === 'December 2026');
    check('5 predicted-period cells in December (Dec 3-7)', (await teval('document.querySelectorAll(".cal-cell.predicted").length')) === 5);
    await teval('document.getElementById("cal-prev").click()');
    await sleep(300);
    check('back to November 2026', await teval('document.getElementById("cal-title").textContent') === 'November 2026');

    // 4. Validation: overlap and future date rejected inline.
    await teval('document.getElementById("period-start").value = "2026-11-06"; document.getElementById("period-end").value = "2026-11-06"; document.getElementById("period-form").requestSubmit()');
    await sleep(300);
    check('overlapping period rejected with message', await teval('document.getElementById("period-msg").textContent.includes("overlap")'));
    check('history still has 2 rows after rejected add', (await teval('document.querySelectorAll("#history-list .row").length')) === 2);
    await teval('document.getElementById("period-start").value = "2026-11-08"; document.getElementById("period-end").value = ""; document.getElementById("period-form").requestSubmit()');
    await sleep(300);
    check('future start rejected with message', await teval('document.getElementById("period-msg").textContent.includes("future")'));

    // 5. Daily log: click Nov 6 cell -> Log tab prefilled; save with cramps.
    await teval('document.querySelector(".cal-cell[data-date=\\"2026-11-06\\"]").click()');
    await sleep(300);
    check('clicking a day switches to Log tab', await teval('document.getElementById("panel-log").classList.contains("active")'));
    check('daily date prefilled with clicked day', await teval('document.getElementById("daily-date").value') === '2026-11-06');
    await teval('document.getElementById("daily-flow").value = "medium"; document.querySelector(".sym-check[value=cramps]").click(); document.getElementById("daily-note").value = "mild"; document.getElementById("daily-form").requestSubmit()');
    await sleep(300);
    check('daily log saved, 1 logged day', (await teval('document.querySelectorAll("#daily-list .row").length')) === 1);
    check('logged day shows flow + symptom + note', await teval('document.querySelector("#daily-list .row").textContent.includes("Medium") && document.querySelector("#daily-list .row").textContent.includes("Cramps") && document.querySelector("#daily-list .row").textContent.includes("mild")'));

    // 6. Persistence across reload.
    await teval('localStorage.getItem("period-tracker-bd-v1") !== null');
    check('state saved to localStorage', await teval('JSON.parse(localStorage.getItem("period-tracker-bd-v1")).periods.length === 2'));
    await tsend('Page.navigate', { url: PAGE });
    await waitFor(async () => (await teval('document.querySelectorAll("#history-list .row").length')) === 2, 10000, 'reload');
    check('history persists after reload (2 rows)', (await teval('document.querySelectorAll("#history-list .row").length')) === 2);
    check('prediction persists after reload (Dec 3)', await teval('document.getElementById("next-period").textContent.includes("2026-12-03")'));

    // 7. Language toggle to Bangla + persistence.
    await teval('document.getElementById("lang-toggle").click()');
    await sleep(300);
    check('title switches to Bengali', await teval('document.querySelector("h1").textContent') === '\u09aa\u09bf\u09b0\u09bf\u09af\u09bc\u09a1 \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0 \u09ac\u09bf\u09a1\u09bf');
    check('html lang switches to bn', await teval('document.documentElement.lang') === 'bn');
    check('next period shows Bengali digits 26', await teval('document.getElementById("next-period").textContent.includes("\u09e8\u09ec")'));
    await tsend('Page.navigate', { url: PAGE });
    await waitFor(async () => (await teval('document.querySelectorAll("#history-list .row").length')) === 2, 10000, 'reload BN');
    check('Bangla still active after reload', await teval('document.documentElement.lang') === 'bn');
    await teval('document.getElementById("lang-toggle").click()');
    await sleep(300);
    check('toggle back to English', await teval('document.querySelector("h1").textContent') === 'Period Tracker BD');

    // 8. Erase flow: wrong word rejected, DELETE erases.
    await teval('document.querySelector("[data-tab=data]").click()');
    await sleep(200);
    await teval('document.getElementById("erase-word").value = "delete"; document.getElementById("erase-btn").click()');
    await sleep(200);
    check('wrong erase word rejected', await teval('document.getElementById("data-msg").textContent.includes("DELETE")'));
    check('data intact after rejected erase', await teval('JSON.parse(localStorage.getItem("period-tracker-bd-v1")).periods.length === 2'));
    await teval('document.getElementById("erase-word").value = "DELETE"; document.getElementById("erase-btn").click()');
    await sleep(300);
    check('DELETE erases everything', await teval('JSON.parse(localStorage.getItem("period-tracker-bd-v1")).periods.length === 0 && JSON.parse(localStorage.getItem("period-tracker-bd-v1")).daily.length === 0'));
    check('history empty again after erase', await teval('document.getElementById("history-list").textContent.includes("No periods logged yet")'));

    // 9. Mobile 390px: no horizontal overflow.
    await tsend('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(500);
    check('no overflow at 390px', await teval('document.documentElement.scrollWidth <= 391'));

    // 10. No console errors / exceptions.
    check('zero console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
    check('zero page exceptions', exceptions.length === 0, exceptions.join(' | '));

    tws.close(); ws.close();
  } finally {
    child.kill();
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  const failed = results.filter((r) => !r[1]).length;
  console.log(failed === 0 ? 'SMOKE PASS: ' + results.length + '/' + results.length : 'SMOKE FAIL: ' + failed + ' failures');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('SMOKE ERROR:', e.message); process.exit(1); });
