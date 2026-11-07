// Period Tracker BD - UI wiring. Vanilla JS, no dependencies.
// State lives in localStorage under KEY; nothing leaves the device.
(function () {
  'use strict';
  var KEY = 'period-tracker-bd-v1';
  var L = window.PTLogic;
  var BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];

  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function getAsOf() {
    var m = /[?&]asof=(\d{4}-\d{2}-\d{2})/.exec(location.search);
    if (m) { var d = L.parseDate(m[1]); if (d !== null) return d; }
    return L.todayDay();
  }
  var TODAY = getAsOf();

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { periods: [], daily: [], lang: 'en' };
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return { periods: [], daily: [], lang: 'en' };
      return {
        periods: Array.isArray(s.periods) ? s.periods.filter(L.isValidPeriod) : [],
        daily: Array.isArray(s.daily) ? s.daily : [],
        lang: s.lang === 'bn' ? 'bn' : 'en',
      };
    } catch (e) { return { periods: [], daily: [], lang: 'en' }; }
  }
  var state = loadState();
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

  var lang = state.lang;
  function t(key) { var s = I18N[key]; return s ? (s[lang] || s.en) : key; }
  function digits(str) {
    str = String(str);
    if (lang !== 'bn') return str;
    return str.replace(/[0-9]/g, function (d) { return BN_DIGITS[+d]; });
  }
  function monthName(idx) { return I18N.monthNames[lang][idx]; }
  function dayName(idx) { return I18N.dayNames[lang][idx]; }

  // Calendar view state: [year, month(0-based)] shown.
  var view = (function () {
    var d = new Date(TODAY * 24 * 60 * 60 * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  })();

  function displayPeriods() {
    // Ongoing periods (no end) are shown up to today, capped at 14 days.
    return state.periods.map(function (p) {
      if (p.end) return p;
      var s = L.parseDate(p.start);
      var end = Math.min(TODAY, s + 13);
      return { start: p.start, end: L.fmtDay(end) };
    });
  }

  function renderDashboard() {
    var preds = L.predictions(state.periods, TODAY, 3);
    var st = L.stats(state.periods);
    var nextEl = qs('#next-period');
    var fertEl = qs('#fertile-window');
    var ovEl = qs('#ovulation');
    if (preds.length === 0) {
      nextEl.textContent = t('noPrediction');
      fertEl.textContent = '-';
      ovEl.textContent = '-';
    } else {
      var p = preds[0];
      var label;
      if (p.daysUntil > 0) label = digits(p.daysUntil) + ' ' + t('daysLeft');
      else if (p.daysUntil === 0) label = t('todayLabel');
      else label = digits(-p.daysUntil) + ' ' + t('daysAgo');
      nextEl.textContent = digits(L.fmtDay(p.start)) + ' | ' + label;
      fertEl.textContent = digits(L.fmtDay(p.fertileStart)) + ' - ' + digits(L.fmtDay(p.fertileEnd));
      ovEl.textContent = digits(L.fmtDay(p.ovulation));
    }
    qs('#stat-cycle').textContent = digits(st.avgCycle.value) + ' ' + t('daysUnit');
    qs('#stat-period').textContent = digits(st.avgPeriod.value) + ' ' + t('daysUnit');
    qs('#stat-total').textContent = digits(st.total);
    qs('#avg-note').textContent = st.avgCycle.fromData ? t('basedOnYours') : t('basedOnDefault');
  }

  function renderCalendar() {
    var y = view.y, m = view.m;
    qs('#cal-title').textContent = monthName(m) + ' ' + digits(y);
    var head = qs('#cal-head');
    head.innerHTML = '';
    for (var i = 0; i < 7; i++) {
      var th = document.createElement('div');
      th.className = 'cal-dow';
      th.textContent = dayName(i);
      head.appendChild(th);
    }
    var grid = qs('#cal-grid');
    grid.innerHTML = '';
    // Week starts Saturday (Bangladesh). JS getUTCDay: 0=Sun..6=Sat.
    var first = Date.UTC(y, m, 1);
    var firstDow = new Date(first).getUTCDay(); // 0 Sun
    var offset = (firstDow + 1) % 7; // Sat -> 0, Sun -> 1, ... Fri -> 6
    var daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var preds = L.predictions(displayPeriods(), TODAY, 3);
    var dp = displayPeriods();
    for (var c = 0; c < offset; c++) {
      var blank = document.createElement('div');
      blank.className = 'cal-cell blank';
      grid.appendChild(blank);
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var dayNum = Math.floor(Date.UTC(y, m, d) / (24 * 60 * 60 * 1000));
      var cls = L.classifyDay(dayNum, dp, preds);
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-cell' + (cls ? ' ' + cls : '') + (dayNum === TODAY ? ' today' : '');
      cell.textContent = digits(d);
      cell.setAttribute('data-date', L.fmtDay(dayNum));
      cell.addEventListener('click', function () {
        var date = this.getAttribute('data-date');
        qs('#daily-date').value = date;
        showTab('log');
        qs('#daily-date').focus();
      });
      grid.appendChild(cell);
    }
  }

  function renderHistory() {
    var list = qs('#history-list');
    list.innerHTML = '';
    if (state.periods.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('emptyHistory');
      list.appendChild(p);
      return;
    }
    L.sortPeriods(state.periods).slice().reverse().forEach(function (per) {
      var row = document.createElement('div');
      row.className = 'row';
      var span = document.createElement('span');
      var len = per.end ? (L.parseDate(per.end) - L.parseDate(per.start) + 1) : null;
      span.textContent = digits(L.fmtDay(L.parseDate(per.start))) + ' - ' +
        (per.end ? digits(L.fmtDay(L.parseDate(per.end))) : '...') +
        (len !== null ? ' (' + digits(len) + ' ' + t('daysUnit') + ')' : '');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small danger';
      btn.textContent = t('deleteBtn');
      btn.addEventListener('click', function () {
        state.periods = state.periods.filter(function (x) { return x.start !== per.start; });
        save(); renderAll();
      });
      row.appendChild(span);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function renderDaily() {
    var list = qs('#daily-list');
    list.innerHTML = '';
    var sorted = state.daily.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (sorted.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('emptyDaily');
      list.appendChild(p);
      return;
    }
    sorted.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'row';
      var span = document.createElement('span');
      var syms = entry.symptoms.map(function (s) { return t('sym' + s.charAt(0).toUpperCase() + s.slice(1)); }).join(', ');
      span.textContent = digits(entry.date) + ' | ' + t('flow' + entry.flow.charAt(0).toUpperCase() + entry.flow.slice(1)) +
        (syms ? ' | ' + syms : '') + (entry.note ? ' | ' + entry.note : '');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small danger';
      btn.textContent = t('deleteBtn');
      btn.addEventListener('click', function () {
        state.daily = state.daily.filter(function (x) { return x.date !== entry.date; });
        save(); renderAll();
      });
      row.appendChild(span);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function renderAll() {
    renderDashboard();
    renderCalendar();
    renderHistory();
    renderDaily();
  }

  function applyLang() {
    document.documentElement.lang = lang;
    qsa('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    qsa('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    qs('#lang-toggle').textContent = t('langBtn');
    renderAll();
  }

  function showTab(name) {
    qsa('.tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    qsa('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + name); });
  }

  function showMsg(el, text, isErr) {
    el.textContent = text;
    el.className = 'msg ' + (isErr ? 'err' : 'ok');
  }

  // --- wiring ---
  qsa('.tab').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
  });
  qs('#lang-toggle').addEventListener('click', function () {
    lang = lang === 'en' ? 'bn' : 'en';
    state.lang = lang;
    save();
    applyLang();
  });
  qs('#cal-prev').addEventListener('click', function () {
    view.m -= 1;
    if (view.m < 0) { view.m = 11; view.y -= 1; }
    renderCalendar();
  });
  qs('#cal-next').addEventListener('click', function () {
    view.m += 1;
    if (view.m > 11) { view.m = 0; view.y += 1; }
    renderCalendar();
  });

  qs('#period-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var start = qs('#period-start').value;
    var end = qs('#period-end').value;
    var msg = qs('#period-msg');
    var err = L.validatePeriod(start, end, state.periods, TODAY);
    if (err !== 'ok') { showMsg(msg, t(err), true); return; }
    state.periods.push({ start: start, end: end || null });
    save();
    qs('#period-form').reset();
    showMsg(msg, t('savedMsg'), false);
    renderAll();
  });

  qs('#daily-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var date = qs('#daily-date').value;
    var flow = qs('#daily-flow').value;
    var symptoms = qsa('.sym-check:checked').map(function (c) { return c.value; });
    var note = qs('#daily-note').value.trim();
    var msg = qs('#daily-msg');
    var err = L.validateDaily(date, flow, symptoms, TODAY);
    if (err !== 'ok') { showMsg(msg, t(err), true); return; }
    state.daily = state.daily.filter(function (x) { return x.date !== date; });
    state.daily.push({ date: date, flow: flow, symptoms: symptoms, note: note });
    save();
    qsa('.sym-check').forEach(function (c) { c.checked = false; });
    qs('#daily-note').value = '';
    showMsg(msg, t('savedMsg'), false);
    renderAll();
  });

  qs('#export-btn').addEventListener('click', function () {
    var data = { app: 'period-tracker-bd', version: 1, periods: L.sortPeriods(state.periods), daily: state.daily };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'period-tracker-bd-export.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  qs('#import-file').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    var msg = qs('#data-msg');
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { showMsg(msg, t('errBadImport'), true); return; }
      var r = L.validateImport(parsed);
      if (!r.ok) { showMsg(msg, t(r.error), true); return; }
      state.periods = r.data.periods;
      state.daily = r.data.daily;
      save();
      showMsg(msg, t('importOk'), false);
      renderAll();
    };
    reader.readAsText(file);
    this.value = '';
  });

  qs('#erase-btn').addEventListener('click', function () {
    var word = qs('#erase-word').value.trim();
    var msg = qs('#data-msg');
    if (word !== 'DELETE') { showMsg(msg, t('errEraseWord'), true); return; }
    state.periods = [];
    state.daily = [];
    save();
    qs('#erase-word').value = '';
    showMsg(msg, t('eraseDone'), false);
    renderAll();
  });

  // Defaults for the forms.
  qs('#period-start').value = L.fmtDay(TODAY);
  qs('#daily-date').value = L.fmtDay(TODAY);

  applyLang();
})();
