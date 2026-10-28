/* GymFlow — offline-first gym & training app.
   Vanilla JS, no build step, no external requests required. */
(function (global) {
  'use strict';

  var root = document.getElementById('app');
  var overlay = document.getElementById('overlay');
  var tabbar = document.getElementById('tabbar');

  var ui = {
    tab: 'home',
    stack: [],
    programId: null,
    sheet: null,
    toast: null,
    restTick: null,
    elapsedTick: null,
    authMode: 'login',
    lastError: ''
  };

  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v, def) { var n = parseFloat(v); return isFinite(n) ? n : (def || 0); }
  function fmt(n, digits) { return (Math.round(n * Math.pow(10, digits || 0)) / Math.pow(10, digits || 0)).toFixed(digits || 0); }
  function pad2(n) { return ('0' + n).slice(-2); }
  function clock(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ':' + pad2(sec % 60);
  }
  function todayLabel() {
    var d = new Date();
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()];
  }
  function vibrate(ms) {
    var d = Store.data();
    if (!d || d.settings.vibrate === false) return;
    try { if (navigator.vibrate) navigator.vibrate(ms || 30); } catch (e) { }
  }
  function toast(msg, kind) {
    ui.toast = { msg: msg, kind: kind || 'ok', at: Date.now() };
    var box = document.getElementById('toast');
    if (!box) return;
    box.className = 'toast show ' + (kind === 'err' ? 'toast-err' : '');
    box.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      box.className = 'toast';
    }, 3200);
  }

  /* ------------------------------------------------------------------ */
  /* navigation                                                          */
  /* ------------------------------------------------------------------ */
  function go(tab) {
    ui.tab = tab;
    ui.sheet = null;
    render();
  }

  function openSheet(html) {
    ui.sheet = html;
    renderOverlay();
  }
  function closeSheet() {
    ui.sheet = null;
    renderOverlay();
  }

  /* ------------------------------------------------------------------ */
  /* render root                                                         */
  /* ------------------------------------------------------------------ */
  function render() {
    var user = Store.user();
    if (!user) {
      renderAuth();
      tabbar.classList.add('hidden');
      return;
    }
    var d = Store.data();
    if (!d.onboardingDone) {
      renderOnboarding();
      tabbar.classList.add('hidden');
      return;
    }
    if (d.activeSession) {
      renderSession();
      tabbar.classList.add('hidden');
      renderOverlay();
      return;
    }
    tabbar.classList.remove('hidden');
    var html = '';
    if (ui.tab === 'home') html = viewHome(d);
    else if (ui.tab === 'train') html = viewTrain(d);
    else if (ui.tab === 'progress') html = viewProgress(d);
    else if (ui.tab === 'pro') html = viewPro(d);
    else html = viewMore(d);
    root.innerHTML = html;
    root.className = 'screen';
    renderNav();
    renderOverlay();
    afterRender();
  }

  function renderNav() {
    var items = [
      { id: 'home', label: 'Home', icon: '🏠' },
      { id: 'train', label: 'Train', icon: '🏋️' },
      { id: 'progress', label: 'Progress', icon: '📈' },
      { id: 'pro', label: 'Pro', icon: '⭐' },
      { id: 'more', label: 'More', icon: '⚙️' }
    ];
    tabbar.innerHTML = items.map(function (it) {
      return '<button class="tab ' + (ui.tab === it.id ? 'active' : '') + '" data-action="tab" data-tab="' + it.id + '">' +
        '<span class="tab-icon">' + it.icon + '</span><span class="tab-label">' + it.label + '</span></button>';
    }).join('');
  }

  function renderOverlay() {
    if (ui.sheet) {
      overlay.innerHTML = '<div class="sheet-backdrop" data-action="close-sheet"></div><div class="sheet">' + ui.sheet + '</div>';
      overlay.classList.add('open');
    } else {
      overlay.innerHTML = '';
      overlay.classList.remove('open');
    }
  }

  function afterRender() {
    // charts need a layout pass
    var wc = document.getElementById('chart-weight');
    if (wc) {
      var d = Store.data();
      Charts.line(wc, d.weights.slice(-14).map(function (w) { return { label: w.date, value: w.kg }; }));
    }
    var vc = document.getElementById('chart-volume');
    if (vc) drawWeeklyVolume(vc);
    var ring = document.getElementById('water-ring');
    if (ring) drawWaterRing(ring);
  }

  /* ------------------------------------------------------------------ */
  /* auth                                                                */
  /* ------------------------------------------------------------------ */
  function renderAuth() {
    var isLogin = ui.authMode === 'login';
    var firstRun = !Store.hasUsers();
    root.className = 'screen screen-auth';
    root.innerHTML =
      '<div class="auth-wrap">' +
      '  <div class="brand">' +
      '    <div class="brand-mark">GF</div>' +
      '    <div>' +
      '      <h1 class="brand-title">GymFlow</h1>' +
      '      <p class="brand-sub">Train offline. Sync when you want.</p>' +
      '    </div>' +
      '  </div>' +
      '  <div class="card auth-card">' +
      '    <div class="pill-row">' +
      '      <button class="pill ' + (isLogin ? 'active' : '') + '" data-action="auth-mode" data-mode="login">Sign in</button>' +
      '      <button class="pill ' + (!isLogin ? 'active' : '') + '" data-action="auth-mode" data-mode="signup">Create account</button>' +
      '    </div>' +
      (ui.lastError ? '<div class="alert">' + esc(ui.lastError) + '</div>' : '') +
      '    <label class="field"><span>Name</span>' +
      '      <input id="auth-name" type="text" autocomplete="username" autocapitalize="words" placeholder="e.g. Arjun" value="">' +
      '    </label>' +
      '    <label class="field"><span>Password</span>' +
      '      <input id="auth-pass" type="password" autocomplete="current-password" placeholder="At least 4 characters">' +
      '    </label>' +
      '    <button class="btn btn-primary btn-block" data-action="auth-submit">' + (isLogin ? 'Sign in' : 'Create account & continue') + '</button>' +
      '    <p class="tiny muted" style="margin-top:12px">' +
      '      Accounts are stored on this device only — no servers needed. ' +
      (firstRun ? 'You are the first user here.' : '') +
      '    </p>' +
      '  </div>' +
      '  <div class="auth-foot">' +
      '    <span class="dot"></span> Works with zero internet' +
      '  </div>' +
      '</div>';
    tabbar.classList.add('hidden');
    renderOverlay();
  }

  /* ------------------------------------------------------------------ */
  /* onboarding                                                          */
  /* ------------------------------------------------------------------ */
  function renderOnboarding() {
    var d = Store.data();
    var p = d.profile;
    root.className = 'screen screen-onboard';
    root.innerHTML =
      '<div class="onboard">' +
      '  <h2>Let’s set up your training</h2>' +
      '  <p class="muted">Used to calculate your calories, macros and starting loads. Change it any time.</p>' +
      '  <div class="card">' +
      '    <label class="field"><span>Your name</span><input id="ob-name" type="text" value="' + esc(p.name) + '" placeholder="Name"></label>' +
      '    <div class="row-2">' +
      '      <label class="field"><span>Age</span><input id="ob-age" type="number" inputmode="numeric" value="' + esc(p.age) + '"></label>' +
      '      <label class="field"><span>Sex</span><select id="ob-sex">' +
      '        <option value="male"' + (p.sex === 'male' ? ' selected' : '') + '>Male</option>' +
      '        <option value="female"' + (p.sex === 'female' ? ' selected' : '') + '>Female</option>' +
      '      </select></label>' +
      '    </div>' +
      '    <div class="row-2">' +
      '      <label class="field"><span>Height (cm)</span><input id="ob-height" type="number" inputmode="numeric" value="' + esc(p.height) + '"></label>' +
      '      <label class="field"><span>Weight (kg)</span><input id="ob-weight" type="number" inputmode="decimal" value="' + esc(p.weight) + '"></label>' +
      '    </div>' +
      '    <label class="field"><span>Goal</span><select id="ob-goal">' +
      goalOptions(p.goal) +
      '    </select></label>' +
      '    <label class="field"><span>Experience</span><select id="ob-level">' +
      levelOptions(p.level) +
      '    </select></label>' +
      '    <button class="btn btn-primary btn-block" data-action="ob-finish">Start training</button>' +
      '  </div>' +
      '</div>';
    tabbar.classList.add('hidden');
    renderOverlay();
  }

  function goalOptions(sel) {
    var goals = [
      ['build-muscle', 'Build muscle'],
      ['lose-fat', 'Lose fat'],
      ['get-stronger', 'Get stronger'],
      ['stay-fit', 'Stay fit / health']
    ];
    return goals.map(function (g) {
      return '<option value="' + g[0] + '"' + (sel === g[0] ? ' selected' : '') + '>' + g[1] + '</option>';
    }).join('');
  }
  function levelOptions(sel) {
    return [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']].map(function (l) {
      return '<option value="' + l[0] + '"' + (sel === l[0] ? ' selected' : '') + '>' + l[1] + '</option>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* HOME                                                                */
  /* ------------------------------------------------------------------ */
  function recommendedProgram(d) {
    if (d.profile.level === 'beginner') {
      return d.profile.goal === 'lose-fat' || d.profile.goal === 'stay-fit'
        ? GymData.PROGRAMS[2] : GymData.PROGRAMS[0];
    }
    return d.profile.goal === 'lose-fat' ? GymData.PROGRAMS[3] : GymData.PROGRAMS[1];
  }

  function tdee(d) {
    var p = d.profile;
    var w = num(p.weight, 70), h = num(p.height, 175), a = num(p.age, 25);
    var bmr = 10 * w + 6.25 * h - 5 * a + (p.sex === 'female' ? -161 : 5);
    var mult = 1.45;
    if (p.goal === 'lose-fat') mult = 1.3;
    if (p.goal === 'build-muscle') mult = 1.6;
    return Math.round(bmr * mult);
  }

  function viewHome(d) {
    var prog = recommendedProgram(d);
    var done = d.workouts.length;
    var dayIdx = done % prog.days.length;
    var day = prog.days[dayIdx];
    var streak = d.streak && d.streak.last ? d.streak.count : 0;
    var water = d.water[Store.todayKey()] || 0;
    var pro = Store.isPro();

    return '' +
      '<header class="topbar">' +
      '  <div>' +
      '    <p class="tiny muted">' + todayLabel() + '</p>' +
      '    <h1 class="h1">Hey ' + esc((d.profile.name || 'athlete').split(' ')[0]) + ' 👋</h1>' +
      '  </div>' +
      '  <button class="avatar" data-action="tab" data-tab="more">' + esc((d.profile.name || 'A').charAt(0).toUpperCase()) + '</button>' +
      '</header>' +

      '<section class="stat-row">' +
      '  <div class="stat"><div class="stat-value">' + streak + '</div><div class="stat-label">day streak</div></div>' +
      '  <div class="stat"><div class="stat-value">' + Store.workoutsThisWeek() + '</div><div class="stat-label">this week</div></div>' +
      '  <div class="stat"><div class="stat-value">' + fmt(Store.volumeThisWeek() / 1000, 1) + 't</div><div class="stat-label">volume</div></div>' +
      '</section>' +

      '<section class="card card-hero">' +
      '  <div class="hero-head">' +
      '    <div><p class="tiny accent">TODAY’S SESSION</p><h2 class="h2">' + esc(day.name) + '</h2>' +
      '    <p class="tiny muted">' + esc(prog.name) + ' · ' + day.items.length + ' exercises</p></div>' +
      '    <div class="hero-ring">' + (dayIdx + 1) + '<span>/' + prog.days.length + '</span></div>' +
      '  </div>' +
      '  <div class="chips">' + day.items.slice(0, 4).map(function (it, i) {
        var ex = GymData.EX_MAP[it[0]];
        return '<span class="chip">' + esc(ex ? ex.name : it[0]) + '</span>';
      }).join('') + '</div>' +
      '  <button class="btn btn-primary btn-block" data-action="start-program-day" data-program="' + prog.id + '" data-day="' + dayIdx + '">Start workout</button>' +
      '</section>' +

      '<section class="grid-2">' +
      '  <button class="card action-card" data-action="sheet-water">' +
      '    <span class="action-icon">💧</span>' +
      '    <span class="action-title">Water</span>' +
      '    <span class="action-sub">' + fmt(water / 1000, 2) + ' / 3.0 L</span>' +
      '  </button>' +
      '  <button class="card action-card" data-action="sheet-weight">' +
      '    <span class="action-icon">⚖️</span>' +
      '    <span class="action-title">Log weight</span>' +
      '    <span class="action-sub">' + fmt(d.profile.weight, 1) + ' kg</span>' +
      '  </button>' +
      '  <button class="card action-card" data-action="tab" data-tab="train">' +
      '    <span class="action-icon">🗂️</span>' +
      '    <span class="action-title">Programs</span>' +
      '    <span class="action-sub">' + GymData.PROGRAMS.length + ' plans</span>' +
      '  </button>' +
      '  <button class="card action-card" data-action="tab" data-tab="progress">' +
      '    <span class="action-icon">🔥</span>' +
      '    <span class="action-title">' + tdee(d) + ' kcal</span>' +
      '    <span class="action-sub">daily target</span>' +
      '  </button>' +
      '</section>' +

      (pro ? '' : Ads.bannerHTML()) +

      '<section class="card">' +
      '  <h3 class="h3">Coach note</h3>' +
      '  <p class="body-text">' + coachNote(d) + '</p>' +
      '</section>' +

      '<div class="spacer"></div>';
  }

  function coachNote(d) {
    var notes = [
      'Progressive overload is the whole game: add reps or a little weight every week.',
      'Sleep is the cheapest supplement you will ever buy. 7–9 hours, every night.',
      'Aim for 1.6–2.2 g of protein per kg of bodyweight if you want to keep the muscle you build.',
      'Warm up with 5 minutes of easy movement plus 2 lighter sets of your first lift.',
      'Two sessions a week beats five sessions you keep skipping. Consistency wins.',
      'Log your sets. What gets measured gets improved.'
    ];
    var seed = new Date().getDate() + d.workouts.length;
    return esc(notes[seed % notes.length]);
  }

  /* ------------------------------------------------------------------ */
  /* TRAIN                                                               */
  /* ------------------------------------------------------------------ */
  function viewTrain(d) {
    if (ui.programId) return viewProgramDetail(d, ui.programId);

    var html = '' +
      '<header class="topbar"><div><p class="tiny muted">Library</p><h1 class="h1">Train</h1></div>' +
      '  <button class="icon-btn" data-action="sheet-exercises">🔍</button>' +
      '</header>' +
      '<div class="seg">' +
      '  <button class="seg-btn active" data-action="train-mode" data-mode="programs">Programs</button>' +
      '  <button class="seg-btn" data-action="sheet-exercises">Exercises (' + GymData.EXERCISES.length + ')</button>' +
      '</div>';

    html += GymData.PROGRAMS.map(function (p) {
      var locked = !Store.isPro() && p.id === 'shred';
      return '<button class="card program-card" data-action="open-program" data-program="' + p.id + '">' +
        '  <div class="program-head">' +
        '    <div><h3 class="h3">' + esc(p.name) + (locked ? ' 🔒' : '') + '</h3>' +
        '    <p class="tiny muted">' + esc(p.tag) + '</p></div>' +
        '    <span class="badge">' + p.weeks + 'w</span>' +
        '  </div>' +
        '  <p class="body-text">' + esc(p.summary) + '</p>' +
        '  <div class="chips">' + p.days.map(function (day) { return '<span class="chip">' + esc(day.name) + '</span>'; }).join('') + '</div>' +
        '</button>';
    }).join('');

    html += '<div class="spacer"></div>';
    return html;
  }

  function viewProgramDetail(d, id) {
    var p = GymData.PROGRAMS.filter(function (x) { return x.id === id; })[0];
    if (!p) { ui.programId = null; return viewTrain(d); }
    var locked = !Store.isPro() && p.id === 'shred';
    return '' +
      '<header class="topbar">' +
      '  <button class="icon-btn" data-action="close-program">←</button>' +
      '  <div style="flex:1"><p class="tiny muted">' + esc(p.tag) + '</p><h1 class="h1">' + esc(p.name) + '</h1></div>' +
      '</header>' +
      (locked ? '<div class="card card-lock"><p class="body-text">This program is part of <strong>GymFlow Pro</strong>. Unlock once, keep it forever — no ads and every program included.</p><button class="btn btn-primary btn-block" data-action="tab" data-tab="pro">Unlock Pro</button></div>' : '') +
      '<p class="body-text">' + esc(p.summary) + '</p>' +
      p.days.map(function (day, di) {
        return '<section class="card">' +
          '  <div class="program-head"><h3 class="h3">' + esc(day.name) + '</h3>' +
          '    <button class="btn btn-primary btn-sm" data-action="start-program-day" data-program="' + p.id + '" data-day="' + di + '"' + (locked ? ' disabled' : '') + '>Start</button>' +
          '  </div>' +
          '  <ul class="ex-list">' + day.items.map(function (it) {
            var ex = GymData.EX_MAP[it[0]];
            if (!ex) return '';
            return '<li><span class="ex-name">' + esc(ex.name) + '</span>' +
              '<span class="ex-meta">' + (it[1] || ex.sets) + ' × ' + esc(it[2] || ex.reps) + '</span></li>';
          }).join('') + '</ul>' +
          '</section>';
      }).join('') +
      '<div class="spacer"></div>';
  }

  /* ------------------------------------------------------------------ */
  /* SESSION PLAYER                                                      */
  /* ------------------------------------------------------------------ */
  function startSession(programId, dayIdx) {
    var p = GymData.PROGRAMS.filter(function (x) { return x.id === programId; })[0];
    if (!p) return;
    if (!Store.isPro() && p.id === 'shred') { toast('This program needs Pro', 'err'); return; }
    var day = p.days[dayIdx % p.days.length];
    var session = {
      programId: p.id,
      dayName: day.name,
      startedAt: Date.now(),
      index: 0,
      restEndsAt: null,
      exercises: day.items.map(function (it) {
        var ex = GymData.EX_MAP[it[0]];
        var setCount = it[1] || (ex ? ex.sets : 3);
        var reps = it[2] || (ex ? ex.reps : '10');
        var sets = [];
        for (var i = 0; i < setCount; i++) sets.push({ weight: '', reps: reps.replace(/[^\d]/g, '') || '10', done: false });
        return { exId: it[0], name: ex ? ex.name : it[0], cue: ex ? ex.cue : '', reps: reps, sets: sets };
      })
    };
    Store.saveActiveSession(session);
    render();
    startElapsedTimer();
  }

  function renderSession() {
    var d = Store.data();
    var s = d.activeSession;
    if (!s) { render(); return; }
    var totalSets = s.exercises.reduce(function (a, e) { return a + e.sets.length; }, 0);
    var doneSets = s.exercises.reduce(function (a, e) {
      return a + e.sets.filter(function (x) { return x.done; }).length;
    }, 0);
    var pct = totalSets ? Math.round(doneSets / totalSets * 100) : 0;
    var elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
    var restLeft = s.restEndsAt ? Math.max(0, Math.round((s.restEndsAt - Date.now()) / 1000)) : 0;

    root.className = 'screen screen-session';
    root.innerHTML =
      '<header class="session-head">' +
      '  <button class="icon-btn" data-action="quit-session">✕</button>' +
      '  <div class="session-title"><p class="tiny muted">' + esc(s.dayName) + '</p><h2 class="h2" id="elapsed">' + clock(elapsed) + '</h2></div>' +
      '  <button class="icon-btn" data-action="finish-session">✓</button>' +
      '</header>' +
      '<div class="progress"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      '<p class="tiny muted center">' + doneSets + ' / ' + totalSets + ' sets logged</p>' +

      (restLeft > 0 ? '<div class="rest-card" id="rest-card">' +
        '  <p class="tiny accent">REST</p>' +
        '  <div class="rest-time" id="rest-time">' + clock(restLeft) + '</div>' +
        '  <div class="row-2"><button class="btn btn-ghost" data-action="rest-add">+30s</button>' +
        '  <button class="btn btn-primary" data-action="rest-skip">Skip rest</button></div>' +
        '</div>' : '') +

      s.exercises.map(function (ex, ei) {
        var isCurrent = ei === s.index;
        return '<section class="card ex-card ' + (isCurrent ? 'ex-card-active' : '') + '">' +
          '  <div class="ex-head"><div><h3 class="h3">' + esc(ex.name) + '</h3>' +
          '  <p class="tiny muted">' + ex.sets.length + ' sets · target ' + esc(ex.reps) + '</p></div>' +
          '  <span class="badge">' + (ei + 1) + '</span></div>' +
          (ex.cue ? '<p class="tiny muted cue">' + esc(ex.cue) + '</p>' : '') +
          '  <div class="set-table">' +
          '    <div class="set-row set-head"><span>#</span><span>kg</span><span>reps</span><span></span></div>' +
          ex.sets.map(function (st, si) {
            return '<div class="set-row ' + (st.done ? 'set-done' : '') + '">' +
              '  <span class="set-idx">' + (si + 1) + '</span>' +
              '  <input class="set-input" type="number" inputmode="decimal" step="0.5" min="0" placeholder="—" value="' + esc(st.weight) + '" data-ex="' + ei + '" data-set="' + si + '" data-field="weight">' +
              '  <input class="set-input" type="number" inputmode="numeric" min="0" value="' + esc(st.reps) + '" data-ex="' + ei + '" data-set="' + si + '" data-field="reps">' +
              '  <button class="set-check ' + (st.done ? 'on' : '') + '" data-action="toggle-set" data-ex="' + ei + '" data-set="' + si + '">' + (st.done ? '✓' : '○') + '</button>' +
              '</div>';
          }).join('') +
          '  </div>' +
          '  <div class="row-2">' +
          '    <button class="btn btn-ghost btn-sm" data-action="add-set" data-ex="' + ei + '">+ Add set</button>' +
          '    <button class="btn btn-ghost btn-sm" data-action="focus-ex" data-ex="' + ei + '">' + (isCurrent ? 'Current' : 'Jump here') + '</button>' +
          '  </div>' +
          '</section>';
      }).join('') +

      '<button class="btn btn-primary btn-block" data-action="finish-session">Finish workout</button>' +
      '<div class="spacer"></div>';
  }

  function startElapsedTimer() {
    clearInterval(ui.elapsedTick);
    ui.elapsedTick = setInterval(function () {
      var d = Store.data();
      if (!d || !d.activeSession) { clearInterval(ui.elapsedTick); return; }
      var el = document.getElementById('elapsed');
      if (el) el.textContent = clock(Math.floor((Date.now() - d.activeSession.startedAt) / 1000));
      var rt = document.getElementById('rest-time');
      if (rt) {
        var left = Math.max(0, Math.round((d.activeSession.restEndsAt - Date.now()) / 1000));
        rt.textContent = clock(left);
        if (left <= 0) {
          vibrate([60, 40, 60]);
          Store.update(function (dd) { if (dd.activeSession) dd.activeSession.restEndsAt = null; });
          render();
        }
      }
    }, 1000);
  }

  function toggleSetAndRest(exIdx, setIdx) {
    var d = Store.data();
    var s = d.activeSession;
    if (!s) return;
    var set = s.exercises[exIdx].sets[setIdx];
    var becomingDone = !set.done;
    Store.update(function (dd) {
      var ss = dd.activeSession;
      ss.exercises[exIdx].sets[setIdx].done = becomingDone;
      if (becomingDone) {
        // advance to next unfinished set of this exercise, else next exercise
        var next = -1;
        ss.exercises[exIdx].sets.forEach(function (x, i) { if (!x.done && next === -1) next = i; });
        if (next === -1 && exIdx < ss.exercises.length - 1) ss.index = exIdx + 1;
        var rest = (dd.settings.restSeconds || 90) * 1000;
        ss.restEndsAt = Date.now() + rest;
      }
    });
    if (becomingDone) vibrate(25);
    render();
    startElapsedTimer();
  }

  function finishSession() {
    var d = Store.data();
    var s = d.activeSession;
    if (!s) { render(); return; }
    var volume = 0, setsDone = 0;
    s.exercises.forEach(function (ex) {
      ex.sets.forEach(function (st) {
        if (st.done) {
          setsDone++;
          volume += num(st.weight) * num(st.reps);
        }
      });
    });
    if (setsDone === 0) {
      openSheet('<h3 class="h3">Nothing logged yet</h3><p class="body-text">Mark at least one set with ✓ before finishing, or discard this session.</p>' +
        '<div class="row-2"><button class="btn btn-ghost" data-action="close-sheet">Back</button>' +
        '<button class="btn btn-danger" data-action="discard-session">Discard</button></div>');
      return;
    }
    var workout = {
      id: 'w_' + Date.now(),
      date: new Date().toISOString(),
      programId: s.programId,
      dayName: s.dayName,
      durationSec: Math.round((Date.now() - s.startedAt) / 1000),
      volume: Math.round(volume),
      exercises: s.exercises.map(function (ex) {
        return {
          exId: ex.exId, name: ex.name,
          sets: ex.sets.filter(function (x) { return x.done; }).map(function (x) {
            return { weight: num(x.weight), reps: num(x.reps), done: true };
          })
        };
      }).filter(function (ex) { return ex.sets.length; })
    };
    Store.finishWorkout(workout);
    clearInterval(ui.elapsedTick);
    vibrate([40, 60, 40]);
    ui.tab = 'home';
    render();
    toast('Workout saved · ' + Math.round(volume) + ' kg volume 💪');
  }

  /* ------------------------------------------------------------------ */
  /* PROGRESS                                                            */
  /* ------------------------------------------------------------------ */
  function drawWeeklyVolume(canvas) {
    var d = Store.data();
    var labels = [], values = [];
    for (var i = 5; i >= 0; i--) {
      var start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay() - i * 7);
      var end = new Date(start.getTime() + 7 * 86400000);
      var vol = d.workouts.filter(function (w) {
        var t = new Date(w.date).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).reduce(function (a, w) { return a + (w.volume || 0); }, 0);
      labels.push('W' + (6 - i));
      values.push(Math.round(vol / 1000 * 10) / 10);
    }
    Charts.bars(canvas, labels, values);
  }

  function drawWaterRing(canvas) {
    var d = Store.data();
    var ml = d.water[Store.todayKey()] || 0;
    var goal = 3000;
    var pct = Math.min(1, ml / goal);
    var ctx = canvas.getContext('2d');
    var dpr = global.devicePixelRatio || 1;
    var size = 112;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();
    ctx.fillStyle = '#e7f5ea';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((ml / 1000).toFixed(2) + 'L', size / 2, size / 2 + 2);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('of 3.0 L', size / 2, size / 2 + 18);
  }

  function viewProgress(d) {
    var prs = Store.personalRecords();
    var kcal = tdee(d);
    var protein = Math.round(num(d.profile.weight, 70) * 2);
    var fat = Math.round(kcal * 0.27 / 9);
    var carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
    var recent = d.workouts.slice(0, 6);

    return '' +
      '<header class="topbar"><div><p class="tiny muted">Your numbers</p><h1 class="h1">Progress</h1></div></header>' +

      '<section class="card">' +
      '  <div class="card-head"><h3 class="h3">Bodyweight</h3>' +
      '  <button class="btn btn-ghost btn-sm" data-action="sheet-weight">Log</button></div>' +
      '  <canvas id="chart-weight" class="chart"></canvas>' +
      '  <p class="tiny muted">' + (d.weights.length ? 'Last: ' + fmt(d.weights[d.weights.length - 1].kg, 1) + ' kg' : 'Log your weight to see the trend.') + '</p>' +
      '</section>' +

      '<section class="card">' +
      '  <h3 class="h3">Weekly volume (tonnes)</h3>' +
      '  <canvas id="chart-volume" class="chart"></canvas>' +
      '</section>' +

      '<section class="card water-card">' +
      '  <div><h3 class="h3">Water today</h3>' +
      '  <p class="tiny muted">Tap to add 250 ml</p>' +
      '  <div class="row-2" style="margin-top:10px">' +
      '    <button class="btn btn-ghost btn-sm" data-action="water-add" data-ml="250">+250 ml</button>' +
      '    <button class="btn btn-ghost btn-sm" data-action="water-add" data-ml="500">+500 ml</button>' +
      '  </div></div>' +
      '  <canvas id="water-ring"></canvas>' +
      '</section>' +

      '<section class="card">' +
      '  <h3 class="h3">Daily nutrition target</h3>' +
      '  <p class="big-value">' + kcal + ' <span class="unit">kcal</span></p>' +
      '  <div class="macro-row">' +
      '    <div class="macro"><span class="macro-val">' + protein + 'g</span><span class="macro-lbl">protein</span></div>' +
      '    <div class="macro"><span class="macro-val">' + carbs + 'g</span><span class="macro-lbl">carbs</span></div>' +
      '    <div class="macro"><span class="macro-val">' + fat + 'g</span><span class="macro-lbl">fat</span></div>' +
      '  </div>' +
      '  <p class="tiny muted">Based on your age, height, weight and goal (Mifflin–St Jeor). Change the goal in More → Profile.</p>' +
      '</section>' +

      '<section class="card">' +
      '  <h3 class="h3">Personal records</h3>' +
      (prs.length ? '<ul class="ex-list">' + prs.map(function (pr) {
        return '<li><span class="ex-name">' + esc(pr.name) + '</span>' +
          '<span class="ex-meta">' + fmt(pr.weight, 1) + ' kg × ' + pr.reps + ' · 1RM ' + pr.oneRm + '</span></li>';
      }).join('') + '</ul>' : '<p class="tiny muted">Log some weighted sets and your estimated 1RMs show up here.</p>') +
      '</section>' +

      '<section class="card">' +
      '  <h3 class="h3">Recent workouts</h3>' +
      (recent.length ? '<ul class="ex-list">' + recent.map(function (w) {
        var dt = new Date(w.date);
        return '<li><span class="ex-name">' + esc(w.dayName) + '</span>' +
          '<span class="ex-meta">' + pad2(dt.getDate()) + '/' + pad2(dt.getMonth() + 1) + ' · ' + clock(w.durationSec) + ' · ' + Math.round((w.volume || 0) / 1000 * 10) / 10 + 't</span></li>';
      }).join('') + '</ul>' : '<p class="tiny muted">No sessions yet. Your first one is waiting on the Home tab.</p>') +
      '</section>' +
      (Ads.enabled() ? Ads.bannerHTML() : '') +
      '<div class="spacer"></div>';
  }

  /* ------------------------------------------------------------------ */
  /* PRO / PAYMENTS                                                      */
  /* ------------------------------------------------------------------ */
  /* The money destination, always visible on the Pro tab. */
  function merchantCardHTML(configured) {
    var m = Pay.merchant();
    return '<section class="card merchant-card">' +
      '  <div class="merchant-top">' +
      '    <span class="tiny muted">Money goes to this UPI ID</span>' +
      '    <span class="chip ' + (configured ? 'chip-ok' : 'chip-warn') + '">' +
      (configured ? 'auto-verify ON' : 'auto-verify OFF') + '</span>' +
      '  </div>' +
      '  <div class="upi-id-row">' +
      '    <div><div class="upi-id">' + esc(m.upiId) + '</div>' +
      '    <p class="tiny muted" style="margin:4px 0 0">Payee name in the UPI app: <strong>' + esc(m.payeeName) + '</strong></p></div>' +
      '    <button class="btn btn-ghost btn-sm" data-action="copy-upi" data-upi="' + esc(m.upiId) + '">Copy</button>' +
      '  </div>' +
      (configured
        ? '<p class="tiny muted" style="margin:8px 0 0">Confirmed automatically by <strong>' + esc(Api.apiBase()) + '</strong>. ' +
          '<button class="link" data-action="check-setup">Test my setup</button></p>'
        : '<p class="tiny muted" style="margin:8px 0 0">No server linked yet, so a payment cannot confirm itself. ' +
          '<button class="link" data-action="check-setup">Test my setup</button> · ' +
          '<button class="link" data-action="sheet-gateway">Show the 3 steps</button></p>') +
      '</section>';
  }

  function viewPro(d) {
    var pro = Store.isPro();
    var plans = Pay.plans();
    var pending = Pay.pendingOrder();
    var configured = Api.isConfigured();

    if (pro) {
      return '' +
        '<header class="topbar"><div><p class="tiny muted">Membership</p><h1 class="h1">Pro</h1></div></header>' +
        '<section class="card card-pro">' +
        '  <div class="pro-badge">PRO</div>' +
        '  <h2 class="h2">You’re ad-free 🎉</h2>' +
        '  <p class="body-text">Unlocked via ' + esc(proSourceLabel(d.pro.source)) + ' on ' + new Date(d.pro.since).toLocaleDateString() + '.</p>' +
        '  <ul class="feature-list">' +
        '    <li>✓ No ads anywhere in the app</li>' +
        '    <li>✓ All training programs unlocked</li>' +
        '    <li>✓ Cloud backup of your training log</li>' +
        '  </ul>' +
        '  <button class="btn btn-ghost btn-block" data-action="pro-restore">Refresh entitlement</button>' +
        '</section>' +
        '<div class="spacer"></div>';
    }

    return '' +
      '<header class="topbar"><div><p class="tiny muted">Support the app</p><h1 class="h1">Go Pro</h1></div></header>' +

      merchantCardHTML(configured) +

      '<section class="card card-pro">' +
      '  <div class="pro-badge">PRO</div>' +
      '  <h2 class="h2">Train without ads</h2>' +
      '  <p class="body-text">One small payment. No subscription traps, no tracking, no data selling.</p>' +
      '  <ul class="feature-list">' +
      plans[0].features.map(function (f) { return '    <li>✓ ' + esc(f) + '</li>'; }).join('') +
      '  </ul>' +
      '</section>' +

      plans.map(function (p, i) {
        return '<button class="card plan-card ' + (i === 0 ? 'plan-primary' : '') + '" data-action="buy" data-plan="' + p.id + '">' +
          '  <div class="plan-row"><div><h3 class="h3">' + esc(p.label) + '</h3>' +
          '  <p class="tiny muted">' + esc(p.period) + '</p></div>' +
          '  <div class="plan-price">₹' + esc(p.amount.replace('.00', '')) + (p.badge ? '<span class="plan-badge">' + esc(p.badge) + '</span>' : '') + '</div></div>' +
          '</button>';
      }).join('') +

      '<section class="card">' +
      '  <h3 class="h3">Direct UPI — 0% fee</h3>' +
      '  <p class="body-text">No card, no aggregator, no 2% cut. Money lands in the receiving account above. ' +
      'The app never sees your UPI PIN, and nothing is charged until you approve it in your UPI app.</p>' +
      (pending ? '<button class="btn btn-primary btn-block" data-action="resume-payment">Continue my pending payment</button>' : '') +
      '</section>' +

      '<section class="card">' +
      '  <h3 class="h3">How it works</h3>' +
      '  <ol class="steps">' +
      '    <li>Tap a plan — the app builds a UPI request for the merchant\'s UPI ID with a unique reference.</li>' +
      '    <li>Scan the QR or tap GPay / PhonePe / Paytm and pay from any UPI app.</li>' +
      '    <li>Enter the 12-digit UTR from your UPI app. The bank credit is matched automatically ' +
      '     (via a YouPI PG observer) and Pro unlocks on this device within seconds.</li>' +
      '  </ol>' +
      (configured ? '' : '<div class="alert alert-info">Payments are not connected yet. ' +
        '<button class="link" data-action="sheet-gateway">Connect your YouPI UPI gateway</button> ' +
        '— takes 3 steps. No server? Use a licence key below.</div>') +
      (configured ? '<div class="tiny muted" style="margin:2px 0 10px">Connected to <strong>' + esc(Api.apiBase()) + '</strong></div>' : '') +
      (pending ? '<div class="alert alert-info">Order <strong>' + esc(pending.orderId) + '</strong> is waiting for confirmation. ' +
        '<button class="link" data-action="pro-verify">Check now</button></div>' : '') +
      (Pay.currentUpiOrder() ? '<div class="alert alert-info">UPI payment <strong>' + esc(Pay.currentUpiOrder().ref) + '</strong> is waiting for the bank confirmation. ' +
        '<button class="link" data-action="resume-payment">Open it</button></div>' : '') +
      '  <div class="row-2" style="margin-top:10px">' +
      '    <button class="btn btn-ghost" data-action="pro-verify">I already paid</button>' +
      '    <button class="btn btn-ghost" data-action="sheet-redeem">Redeem key</button>' +
      '  </div>' +
      ((global.GYMFLOW_CONFIG || {}).demoMode && pending ? '<button class="btn btn-ghost btn-block" style="margin-top:8px" data-action="pro-simulate">Simulate payment (demo)</button>' : '') +
      '</section>' +

      '<p class="tiny muted center">Payments are processed by your own YOUPI PG instance.<br>Nothing is charged until you confirm in your UPI app.</p>' +
      '<div class="spacer"></div>';
  }

  function proSourceLabel(src) {
    if (src === 'licence') return 'a licence key';
    if (src === 'offline-licence') return 'an offline licence key';
    if (src === 'gateway-observed') return 'UPI (bank alert observed)';
    return 'UPI payment';
  }

  /* ------------------------------------------------------------------ */
  /* MORE / SETTINGS                                                     */
  /* ------------------------------------------------------------------ */
  function viewMore(d) {
    var u = Store.user();
    var p = d.profile;
    return '' +
      '<header class="topbar"><div><p class="tiny muted">Account & app</p><h1 class="h1">More</h1></div></header>' +

      '<section class="card profile-card">' +
      '  <div class="avatar avatar-lg">' + esc((p.name || 'A').charAt(0).toUpperCase()) + '</div>' +
      '  <div><h3 class="h3">' + esc(p.name || u.display) + '</h3>' +
      '  <p class="tiny muted">' + esc(p.level) + ' · ' + esc(p.goal.replace('-', ' ')) + ' · ' + fmt(p.weight, 1) + ' kg</p></div>' +
      '  <span class="badge ' + (Store.isPro() ? 'badge-pro' : '') + '">' + (Store.isPro() ? 'PRO' : 'FREE') + '</span>' +
      '</section>' +

      '<section class="card">' +
      '  <h3 class="h3">Profile</h3>' +
      '  <div class="row-2">' +
      '    <label class="field"><span>Name</span><input id="set-name" type="text" value="' + esc(p.name) + '"></label>' +
      '    <label class="field"><span>Age</span><input id="set-age" type="number" value="' + esc(p.age) + '"></label>' +
      '  </div>' +
      '  <div class="row-2">' +
      '    <label class="field"><span>Height (cm)</span><input id="set-height" type="number" value="' + esc(p.height) + '"></label>' +
      '    <label class="field"><span>Weight (kg)</span><input id="set-weight" type="number" step="0.1" value="' + esc(p.weight) + '"></label>' +
      '  </div>' +
      '  <div class="row-2">' +
      '    <label class="field"><span>Goal</span><select id="set-goal">' + goalOptions(p.goal) + '</select></label>' +
      '    <label class="field"><span>Sex</span><select id="set-sex">' +
      '      <option value="male"' + (p.sex === 'male' ? ' selected' : '') + '>Male</option>' +
      '      <option value="female"' + (p.sex === 'female' ? ' selected' : '') + '>Female</option>' +
      '    </select></label>' +
      '  </div>' +
      '  <label class="field"><span>Rest timer (seconds)</span><input id="set-rest" type="number" value="' + esc(d.settings.restSeconds) + '"></label>' +
      '  <button class="btn btn-primary btn-block" data-action="save-settings">Save changes</button>' +
      '</section>' +

      '<section class="card">' +
      '  <h3 class="h3">Cloud & payments server</h3>' +
      '  <p class="tiny muted">Where the GymFlow payment bridge (YOUPI PG) is hosted. Leave empty for a fully offline app.</p>' +
      '  <label class="field"><span>Server URL</span><input id="set-server" type="url" placeholder="https://gymflow.example.com" value="' + esc(Api.apiBase()) + '"></label>' +
      '  <div class="row-2">' +
      '    <button class="btn btn-ghost" data-action="test-server">Test connection</button>' +
      '    <button class="btn btn-primary" data-action="save-server">Save</button>' +
      '  </div>' +
      '  <div id="server-status" class="tiny muted" style="margin-top:8px"></div>' +
      '</section>' +

      '<section class="card">' +
      '  <h3 class="h3">Cloud backup</h3>' +
      '  <p class="tiny muted">Push your training log to your own server and pull it on another phone.</p>' +
      '  <label class="field"><span>Sync code</span><input id="sync-code" type="text" placeholder="e.g. arjun-7f3k" value=""></label>' +
      '  <div class="row-2">' +
      '    <button class="btn btn-ghost" data-action="sync-push">Back up</button>' +
      '    <button class="btn btn-ghost" data-action="sync-pull">Restore</button>' +
      '  </div>' +
      '</section>' +

      '<section class="card">' +
      '  <h3 class="h3">Data</h3>' +
      '  <div class="row-2">' +
      '    <button class="btn btn-ghost" data-action="export-data">Export backup</button>' +
      '    <button class="btn btn-ghost" data-action="sheet-import">Import backup</button>' +
      '  </div>' +
      '  <div class="row-2" style="margin-top:8px">' +
      '    <button class="btn btn-ghost" data-action="sheet-redeem">Redeem Pro key</button>' +
      '    <button class="btn btn-ghost" data-action="pro-restore">Restore purchase</button>' +
      '  </div>' +
      '</section>' +

      '<section class="card">' +
      '  <h3 class="h3">About</h3>' +
      '  <p class="tiny muted">GymFlow ' + esc((global.GYMFLOW_CONFIG || {}).version || '1.0.0') +
      ' · offline-first · no trackers<br>Payments: YOUPI PG self-hosted UPI gateway</p>' +
      '  <div class="row-2" style="margin-top:10px">' +
      '    <button class="btn btn-ghost" data-action="sign-out">Sign out</button>' +
      '    <button class="btn btn-danger" data-action="delete-account">Delete account</button>' +
      '  </div>' +
      '</section>' +
      '<div class="spacer"></div>';
  }

  /* ------------------------------------------------------------------ */
  /* sheets                                                              */
  /* ------------------------------------------------------------------ */
  function sheetWater() {
    var ml = Store.waterToday();
    openSheet('<h3 class="h3">Water today</h3>' +
      '<p class="body-text">' + fmt(ml / 1000, 2) + ' L of 3.0 L</p>' +
      '<div class="row-2" style="margin-top:10px">' +
      '<button class="btn btn-ghost" data-action="water-add" data-ml="250">+250 ml</button>' +
      '<button class="btn btn-ghost" data-action="water-add" data-ml="500">+500 ml</button>' +
      '</div>' +
      '<div class="row-2" style="margin-top:8px">' +
      '<button class="btn btn-ghost" data-action="water-add" data-ml="-250">-250 ml</button>' +
      '<button class="btn btn-primary" data-action="close-sheet">Done</button>' +
      '</div>');
  }

  function sheetWeight() {
    var d = Store.data();
    openSheet('<h3 class="h3">Log today’s weight</h3>' +
      '<label class="field"><span>Kilograms</span><input id="weight-input" type="number" step="0.1" value="' + fmt(d.profile.weight, 1) + '"></label>' +
      '<div class="row-2"><button class="btn btn-ghost" data-action="close-sheet">Cancel</button>' +
      '<button class="btn btn-primary" data-action="save-weight">Save</button></div>');
  }

  function sheetExercises() {
    var groups = {};
    GymData.EXERCISES.forEach(function (e) { (groups[e.muscle] = groups[e.muscle] || []).push(e); });
    openSheet('<div class="sheet-head"><h3 class="h3">Exercise library</h3>' +
      '<button class="icon-btn" data-action="close-sheet">✕</button></div>' +
      '<label class="field"><span>Search</span><input id="ex-search" type="text" placeholder="bench, squat, core…"></label>' +
      '<div id="ex-results">' + exerciseListHTML(GymData.EXERCISES) + '</div>');
  }

  function exerciseListHTML(list) {
    if (!list.length) return '<p class="tiny muted">Nothing matched.</p>';
    return '<ul class="ex-list ex-list-tall">' + list.map(function (e) {
      return '<li><div><span class="ex-name">' + esc(e.name) + '</span>' +
        '<span class="tiny muted"> · ' + esc(e.muscle) + ' · ' + esc(e.equipment) + '</span>' +
        '<p class="tiny muted">' + esc(e.cue) + '</p></div>' +
        '<button class="btn btn-ghost btn-sm" data-action="quick-start-ex" data-ex="' + e.id + '">Start</button></li>';
    }).join('') + '</ul>';
  }

  /* In-app version of docs/HOSTING.md — three steps, plain language. */
  function sheetGateway() {
    var configured = Api.isConfigured();
    var m = Pay.merchant();
    openSheet(
      '<div class="sheet-head"><h3 class="h3">Make UPI work</h3>' +
      '<button class="icon-btn" data-action="close-sheet">\u2715</button></div>' +

      merchantCardHTML(configured) +

      '<p class="body-text" style="margin-top:10px">Money is collected straight into the UPI ID above with a QR code drawn on the phone. ' +
      'But a phone cannot see your bank account \u2014 so one small server has to sit in between and confirm each credit. Three steps:</p>' +

      '<ol class="steps">' +
      '  <li><strong>Host the bridge</strong> \u2014 one Node command on a VPS, Render or Railway. ' +
      'Full copy-paste guide: <code>docs/HOSTING.md</code> in the repo.</li>' +
      '  <li><strong>Run YouPI PG</strong> next to it and create a merchant whose receiving VPA is ' +
      '     <strong>' + esc(m.upiId) + '</strong>. Copy the <em>merchant id</em> and <em>webhook secret</em> into the bridge\u2019s <code>.env</code>.</li>' +
      '  <li><strong>Pair the observer</strong> (YouPI\u2019s Android app on the phone that receives the bank SMS, or the Gmail observer) ' +
      '     and set the webhook to <code>https://your-server/api/youpi/webhook</code>. Now every credit is matched by UTR automatically.</li>' +
      '</ol>' +

      '<label class="field" style="margin-top:12px"><span>Your GymFlow server URL</span>' +
      '<input id="gateway-url" type="url" autocapitalize="off" placeholder="https://gym.mydomain.com" value="' + esc(Api.apiBase()) + '"></label>' +
      '<div class="row-2">' +
      '  <button class="btn btn-ghost" data-action="gateway-save">Save &amp; test</button>' +
      '  <button class="btn btn-primary" data-action="check-setup">Test my setup</button>' +
      '</div>' +
      '<div id="gateway-status" class="tiny muted" style="margin-top:10px">' +
      (configured ? 'Currently connected to ' + esc(Api.apiBase()) : 'No server configured yet \u2014 payments show a QR but cannot confirm by themselves.') +
      '</div>' +
      '<p class="tiny muted" style="margin-top:14px">YouPI how-to videos: ' +
      '<button class="link" data-action="gateway-docs">open the YouTube walkthrough</button>.<br>' +
      'No server at all? You can still sell Pro with ' +
      '<button class="link" data-action="sheet-redeem">licence keys</button> \u2014 they work with zero internet.</p>'
    );
  }

  /* End-to-end self check of the hosted setup, answered by the server itself. */
  function checkSetup() {
    var typed = ((document.getElementById('gateway-url') || {}).value ||
                 (document.getElementById('set-server') || {}).value || '').trim();
    if (typed) Api.setApiBase(typed);
    if (!Api.isConfigured()) {
      openSheet('<div class="sheet-head"><h3 class="h3">Setup check</h3>' +
        '<button class="icon-btn" data-action="close-sheet">\u2715</button></div>' +
        '<p class="body-text">No server URL saved yet. Host the bridge first (see <code>docs/HOSTING.md</code>), ' +
        'then paste its https URL on this screen.</p>' +
        '<button class="btn btn-primary btn-block" data-action="sheet-gateway">Enter server URL</button>');
      return;
    }
    openSheet('<div class="sheet-head"><h3 class="h3">Setup check</h3>' +
      '<button class="icon-btn" data-action="close-sheet">\u2715</button></div>' +
      '<p class="body-text">Asking <strong>' + esc(Api.apiBase()) + '</strong> how it is configured\u2026</p>' +
      '<div class="spinner"></div>');

    var mine = Pay.merchant().upiId;
    Promise.all([
      Api.health().catch(function (e) { return { __error: e.message }; }),
      Api.upiConfig().catch(function (e) { return { __error: e.message }; })
    ]).then(function (r) {
      var health = r[0] || {}, uconf = r[1] || {};
      var online = !health.__error;
      var serverUpi = uconf.upiId || health.merchantUpiId || '';
      var match = serverUpi && serverUpi.toLowerCase() === mine.toLowerCase();
      var real = (health.provider || '') !== 'mock';
      // true = green tick, null = amber warning (works, but not ideal), false = red cross
      var row = function (good, label, note) {
        var cls = good === null ? 'warn' : (good ? 'ok' : 'err');
        var mark = good === null ? '!' : (good ? '\u2713' : '\u2717');
        return '<li class="' + cls + '">' + mark + ' ' +
          esc(label) + (note ? '<br><span class="tiny muted">' + esc(note) + '</span>' : '') + '</li>';
      };
      openSheet(
        '<div class="sheet-head"><h3 class="h3">Setup check</h3>' +
        '<button class="icon-btn" data-action="close-sheet">\u2715</button></div>' +
        '<ul class="setup-check">' +
        row(online, 'Server reachable', online ? Api.apiBase() : health.__error) +
        row(match, 'Receiving UPI matches', 'server: ' + (serverUpi || '\u2014') + ' \u00b7 app: ' + mine) +
        row(real ? true : null, 'Real UPI gateway wired', real ? 'provider: ' + health.provider : 'provider is "mock" \u2014 no real money moves yet; you can still approve payments by hand on /admin (set PAYMENT_PROVIDER=youpi for automatic)') +
        row(!!health.webhookReady, 'Webhook secret accepted', health.webhookReady ? 'a bank credit will unlock Pro automatically' : 'YOUPI_MERCHANT_SECRET is missing') +
        row(!!uconf.manualApproval, 'Admin approve page available', health.adminConsole ? '/admin?token=\u2026' : 'set ADMIN_TOKEN')
        + '</ul>' +
        '<p class="tiny muted" style="margin-top:10px">Fix anything marked \u2717 in <code>docs/HOSTING.md</code> \u2192 Troubleshooting, ' +
        'or run <code>node scripts/check-deploy.mjs ' + esc(Api.apiBase()) + '</code> on the server for a machine-readable report.</p>' +
        '<div class="row-2"><button class="btn btn-ghost" data-action="check-setup">Re-run</button>' +
        '<button class="btn btn-primary" data-action="close-sheet">Done</button></div>'
      );
    });
  }

  function sheetRedeem() {
    openSheet('<h3 class="h3">Redeem a Pro key</h3>' +
      '<p class="tiny muted">Works offline. Keys look like <code>GF-XXXX-XXXX</code>.</p>' +
      '<label class="field"><span>Licence key</span><input id="redeem-input" type="text" autocapitalize="characters" placeholder="GF-…"></label>' +
      '<div class="row-2"><button class="btn btn-ghost" data-action="close-sheet">Cancel</button>' +
      '<button class="btn btn-primary" data-action="redeem-submit">Unlock</button></div>');
  }

  function sheetImport() {
    openSheet('<h3 class="h3">Import backup</h3>' +
      '<p class="tiny muted">Paste the JSON from your exported backup. This replaces the current account’s data.</p>' +
      '<label class="field"><span>Backup JSON</span><textarea id="import-input" rows="6" placeholder="{ &quot;app&quot;: &quot;GymFlow&quot; … }"></textarea></label>' +
      '<div class="row-2"><button class="btn btn-ghost" data-action="close-sheet">Cancel</button>' +
      '<button class="btn btn-primary" data-action="import-submit">Import</button></div>');
  }

  /* ------------------------------------------------------------------ */
  /* events                                                              */
  /* ------------------------------------------------------------------ */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-action]') : null;
    if (!el) return;
    var action = el.getAttribute('data-action');
    var d = Store.data();

    switch (action) {
      /* nav */
      case 'tab': go(el.getAttribute('data-tab')); break;
      case 'close-sheet': closeSheet(); break;

      /* auth */
      case 'auth-mode':
        ui.authMode = el.getAttribute('data-mode');
        ui.lastError = '';
        render();
        break;
      case 'auth-submit': {
        var name = (document.getElementById('auth-name') || {}).value || '';
        var pass = (document.getElementById('auth-pass') || {}).value || '';
        var res = ui.authMode === 'login' ? Store.login(name, pass) : Store.signup(name, pass);
        if (!res.ok) { ui.lastError = res.error; render(); return; }
        ui.lastError = '';
        render();
        break;
      }
      case 'ob-finish': {
        var patch = {
          name: (document.getElementById('ob-name') || {}).value || 'Athlete',
          age: num((document.getElementById('ob-age') || {}).value, 25),
          sex: (document.getElementById('ob-sex') || {}).value || 'male',
          height: num((document.getElementById('ob-height') || {}).value, 175),
          weight: num((document.getElementById('ob-weight') || {}).value, 70),
          goal: (document.getElementById('ob-goal') || {}).value || 'build-muscle',
          level: (document.getElementById('ob-level') || {}).value || 'beginner'
        };
        Store.setProfile(patch);
        if (Store.data().weights.length === 0) Store.logWeight(patch.weight);
        go('home');
        toast('You’re all set, ' + patch.name.split(' ')[0] + '!');
        break;
      }

      /* train */
      case 'open-program':
        ui.programId = el.getAttribute('data-program');
        render();
        break;
      case 'close-program':
        ui.programId = null;
        render();
        break;
      case 'sheet-exercises': sheetExercises(); break;
      case 'start-program-day':
        startSession(el.getAttribute('data-program'), parseInt(el.getAttribute('data-day'), 10) || 0);
        break;
      case 'quick-start-ex': {
        var ex = GymData.EX_MAP[el.getAttribute('data-ex')];
        closeSheet();
        if (!ex) return;
        var sets = [];
        for (var i = 0; i < ex.sets; i++) sets.push({ weight: '', reps: String(ex.reps).replace(/[^\d]/g, '') || '10', done: false });
        Store.saveActiveSession({
          programId: 'quick', dayName: ex.name, startedAt: Date.now(), index: 0, restEndsAt: null,
          exercises: [{ exId: ex.id, name: ex.name, cue: ex.cue, reps: ex.reps, sets: sets }]
        });
        render();
        startElapsedTimer();
        break;
      }

      /* session */
      case 'toggle-set':
        toggleSetAndRest(parseInt(el.getAttribute('data-ex'), 10), parseInt(el.getAttribute('data-set'), 10));
        break;
      case 'add-set': {
        var ei = parseInt(el.getAttribute('data-ex'), 10);
        Store.update(function (dd) {
          if (!dd.activeSession) return;
          var last = dd.activeSession.exercises[ei].sets.slice(-1)[0] || { weight: '', reps: '10' };
          dd.activeSession.exercises[ei].sets.push({ weight: last.weight, reps: last.reps, done: false });
        });
        render();
        break;
      }
      case 'focus-ex':
        Store.update(function (dd) {
          if (dd.activeSession) dd.activeSession.index = parseInt(el.getAttribute('data-ex'), 10);
        });
        render();
        break;
      case 'rest-skip':
        Store.update(function (dd) { if (dd.activeSession) dd.activeSession.restEndsAt = null; });
        render();
        break;
      case 'rest-add':
        Store.update(function (dd) {
          if (dd.activeSession && dd.activeSession.restEndsAt) dd.activeSession.restEndsAt += 30000;
        });
        render();
        break;
      case 'finish-session': finishSession(); break;
      case 'quit-session':
        openSheet('<h3 class="h3">Leave this workout?</h3><p class="body-text">Your logged sets stay saved until you discard the session.</p>' +
          '<div class="row-2"><button class="btn btn-ghost" data-action="close-sheet">Keep training</button>' +
          '<button class="btn btn-danger" data-action="discard-session">Discard</button></div>');
        break;
      case 'discard-session':
        Store.clearActiveSession();
        closeSheet();
        go('home');
        break;

      /* water / weight */
      case 'sheet-water': sheetWater(); break;
      case 'water-add':
        Store.addWater(parseInt(el.getAttribute('data-ml'), 10) || 250);
        vibrate(15);
        render();
        if (ui.sheet) sheetWater();
        break;
      case 'sheet-weight': sheetWeight(); break;
      case 'save-weight': {
        var kg = num((document.getElementById('weight-input') || {}).value, 0);
        if (!kg) { toast('Enter a weight', 'err'); return; }
        Store.logWeight(kg);
        closeSheet();
        render();
        toast('Weight saved');
        break;
      }

      /* pro */
      case 'buy': buy(el.getAttribute('data-plan')); break;
      case 'pro-verify': verifyPayment(); break;
      case 'submit-utr': submitUtr(); break;
      case 'open-upi': Pay.openExternal(el.getAttribute('data-url')); break;
      case 'copy-upi': {
        var upi = el.getAttribute('data-upi');
        try {
          if (navigator.clipboard) navigator.clipboard.writeText(upi);
          toast('UPI ID copied');
        } catch (e) { toast(upi); }
        break;
      }
      case 'resume-payment': {
        var openOrder = Pay.currentUpiOrder();
        if (openOrder) showUpiSheet(openOrder, Pay.plan(openOrder.planId));
        break;
      }
      case 'pro-restore': restorePurchase(); break;
      case 'pro-simulate': simulatePayment(); break;
      case 'sheet-redeem': sheetRedeem(); break;
      case 'sheet-gateway': sheetGateway(); break;
      case 'gateway-save': gatewaySave(); break;
      case 'check-setup': checkSetup(); break;
      case 'gateway-docs':
        Pay.openExternal('https://www.youtube.com/results?search_query=YouPI+PG+UPI+payment+gateway+setup');
        break;
      case 'redeem-submit': submitRedeem(); break;
      case 'ad-remove': go('pro'); break;
      case 'ad-cta': {
        var url = el.getAttribute('data-url');
        if (url) Pay.openExternal(url);
        else if ((el.getAttribute('data-cta') || '').indexOf('Pro') >= 0) go('pro');
        else toast('Thanks for supporting GymFlow!');
        break;
      }

      /* more */
      case 'save-settings': saveSettings(); break;
      case 'save-server': {
        var url2 = ((document.getElementById('set-server') || {}).value || '').trim();
        Api.setApiBase(url2);
        toast(url2 ? 'Server saved' : 'Offline mode');
        render();
        break;
      }
      case 'test-server': testServer(); break;
      case 'sync-push': syncPush(); break;
      case 'sync-pull': syncPull(); break;
      case 'export-data': exportData(); break;
      case 'sheet-import': sheetImport(); break;
      case 'import-submit': importData(); break;
      case 'sign-out':
        Store.logout();
        ui.authMode = 'login';
        ui.tab = 'home';
        render();
        break;
      case 'delete-account':
        openSheet('<h3 class="h3">Delete this account?</h3><p class="body-text">All workouts, weights and the Pro unlock on this device go away. This cannot be undone.</p>' +
          '<div class="row-2"><button class="btn btn-ghost" data-action="close-sheet">Cancel</button>' +
          '<button class="btn btn-danger" data-action="confirm-delete">Delete</button></div>');
        break;
      case 'confirm-delete':
        Store.deleteAccount();
        closeSheet();
        ui.tab = 'home';
        render();
        break;
    }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t && t.classList && t.classList.contains('set-input')) {
      var ei = parseInt(t.getAttribute('data-ex'), 10);
      var si = parseInt(t.getAttribute('data-set'), 10);
      var field = t.getAttribute('data-field');
      var d = Store.data();
      if (d && d.activeSession && d.activeSession.exercises[ei] && d.activeSession.exercises[ei].sets[si]) {
        d.activeSession.exercises[ei].sets[si][field] = t.value;
        Store.save();
      }
    }
    if (t && t.id === 'ex-search') {
      var q = t.value.toLowerCase().trim();
      var list = GymData.EXERCISES.filter(function (e) {
        return !q || (e.name + ' ' + e.muscle + ' ' + e.equipment).toLowerCase().indexOf(q) >= 0;
      });
      var box = document.getElementById('ex-results');
      if (box) box.innerHTML = exerciseListHTML(list);
    }
  });

  /* ------------------------------------------------------------------ */
  /* payment actions                                                     */
  /* ------------------------------------------------------------------ */
  function buy(planId) {
    var plan = Pay.plan(planId);
    openSheet('<h3 class="h3">Preparing your UPI payment…</h3><div class="spinner"></div>');
    Pay.startDirectUpi(planId).then(function (order) {
      showUpiSheet(order, plan);
    }).catch(function (err) {
      openSheet('<h3 class="h3">Could not start the payment</h3><p class="body-text">' + esc(err.message) + '</p>' +
        '<button class="btn btn-ghost btn-block" data-action="close-sheet">Close</button>');
    });
  }

  /* The main payment screen: QR + app buttons + UTR verification. */
  function showUpiSheet(order, plan) {
    var apps = Pay.appLinks(order.uri);
    var pending = Pay.currentUpiOrder();
    var isPro = Store.isPro();
    openSheet(
      '<div class="sheet-head"><h3 class="h3">Pay ₹' + esc(String(order.amount).replace(/\.00$/, '')) + ' by UPI</h3>' +
      '<button class="icon-btn" data-action="close-sheet">✕</button></div>' +

      '<div class="upi-box">' +
      '  <div class="qr-wrap"><canvas id="upi-qr" class="upi-qr"></canvas></div>' +
      '  <p class="tiny muted center" style="margin:8px 0 0">Scan with any UPI app, or tap a button below</p>' +
      '  <div class="upi-id-row">' +
      '    <div><span class="tiny muted">Paying to</span><div class="upi-id">' + esc(order.upiId) + '</div></div>' +
      '    <button class="btn btn-ghost btn-sm" data-action="copy-upi" data-upi="' + esc(order.upiId) + '">Copy</button>' +
      '  </div>' +
      '  <p class="tiny muted center" style="margin:6px 0 0">Reference <strong>' + esc(order.ref) + '</strong></p>' +
      '</div>' +

      '<div class="upi-apps">' +
      apps.map(function (a) {
        return '<button class="upi-app" data-action="open-upi" data-url="' + esc(a.url) + '">' +
          '<span class="upi-app-icon">' + a.icon + '</span>' +
          '<span class="upi-app-label">' + esc(a.label) + '</span></button>';
      }).join('') +
      '</div>' +

      (order.offline
        ? '<div class="alert alert-info">You are offline, so this payment cannot be verified automatically. ' +
          'Pay, then send the reference <strong>' + esc(order.ref) + '</strong> to the developer, or connect a server in Settings.</div>'
        : '') +

      '<section class="card" style="margin-top:12px">' +
      '  <h3 class="h3">Already paid? Enter the reference</h3>' +
      '  <p class="tiny muted">Open your UPI app → transaction details → copy the 12-digit UTR / reference number.</p>' +
      '  <label class="field" style="margin-top:8px"><span>12-digit UTR</span>' +
      '  <input id="utr-input" type="tel" inputmode="numeric" maxlength="12" placeholder="e.g. 412345678901"></label>' +
      '  <button class="btn btn-primary btn-block" data-action="submit-utr">Verify my payment</button>' +
      '  <div id="utr-status" class="tiny muted" style="margin-top:8px">' +
      (order.offline ? 'Automatic verification needs a payment server.' : 'We check with your bank alert automatically — no need to wait on a human.') +
      '  </div>' +
      '</section>' +

      '<p class="tiny muted center" style="margin-top:10px">' +
      'Money goes straight to the merchant\'s own bank account via UPI. ' +
      'GymFlow never sees your card or UPI PIN.' +
      '</p>'
    );

    // draw the QR after the sheet is in the DOM
    setTimeout(function () {
      var canvas = document.getElementById('upi-qr');
      if (!canvas) return;
      try {
        var qr = QR.encode(order.uri);
        QR.renderToCanvas(canvas, qr, { margin: 3, size: 240, dark: '#0b120d', light: '#ffffff' });
      } catch (e) {
        canvas.parentNode.innerHTML = '<p class="tiny err">Could not draw the QR (' + esc(e.message) + ')</p>';
      }
    }, 0);

    // resume watching an order that is already waiting for confirmation
    var open = Pay.currentUpiOrder();
    if (!isPro && open && !order.offline) {
      Pay.watchUpiOrder(open.ref, function (tick) {
        var el = document.getElementById('utr-status');
        if (!el) return;
        if (tick.error) el.textContent = 'Waiting… (' + tick.error + ')';
        else if (tick.status === 'awaiting_confirmation') el.innerHTML = '<span class="ok">Reference received.</span> Waiting for the bank confirmation…';
        else el.textContent = 'Status: ' + (tick.status || 'waiting');
      }).then(function (r) {
        if (r && r.pro) { closeSheet(); render(); toast('Payment confirmed — Pro unlocked 🎉'); }
      });
    }
  }

  function submitUtr() {
    var order = Pay.currentUpiOrder();
    var input = document.getElementById('utr-input');
    var out = document.getElementById('utr-status');
    var utr = (input && input.value || '').trim();
    if (!order) { toast('Start a payment first', 'err'); return; }
    if (out) out.textContent = 'Checking…';
    Pay.submitUtr(order.ref, utr).then(function (res) {
      if (res && res.pro) {
        closeSheet(); render(); toast('Payment verified — Pro unlocked 🎉');
        return;
      }
      if (out) {
        out.innerHTML = res && res.offline
          ? '<span class="err">Saved on this device only.</span> Connect a payment server so the merchant can verify it.'
          : '<span class="ok">Reference received.</span> ' + (res && res.message ? esc(res.message) : '') +
            '<br>This screen updates by itself — you can also close it and keep training.';
      }
      if (!res || !res.offline) {
        Pay.watchUpiOrder(order.ref, null).then(function (r) {
          if (r && r.pro) { closeSheet(); render(); toast('Payment confirmed — Pro unlocked 🎉'); }
        });
      }
    }).catch(function (err) {
      if (out) out.innerHTML = '<span class="err">' + esc(err.message) + '</span>';
    });
  }

  function waitForPayment(orderId) {
    openSheet('<h3 class="h3">Waiting for the gateway…</h3>' +
      '<p class="body-text" id="pay-status">Checking your payment status every 5 seconds.</p>' +
      '<div class="spinner"></div>' +
      '<button class="btn btn-ghost btn-block" data-action="pro-verify">Check now</button>');
    Pay.poll(orderId, function (tick) {
      var el = document.getElementById('pay-status');
      if (!el) return;
      if (tick.error) el.textContent = 'Waiting… (' + tick.error + ')';
      else el.textContent = 'Status: ' + (tick.status || 'pending');
    }).then(function (r) {
      if (r.pro) {
        closeSheet();
        render();
        openSheet('<h3 class="h3">Pro unlocked 🎉</h3><p class="body-text">Ads are gone and every program is open. Thanks for supporting GymFlow.</p>' +
          '<button class="btn btn-primary btn-block" data-action="close-sheet">Let’s train</button>');
      } else {
        openSheet('<h3 class="h3">Not confirmed yet</h3>' +
          '<p class="body-text">The gateway has not reported this payment. UPI bank alerts can take a minute. Your order is saved — tap “I already paid” on the Pro tab later.</p>' +
          '<div class="row-2"><button class="btn btn-ghost" data-action="close-sheet">Close</button>' +
          '<button class="btn btn-primary" data-action="pro-verify">Check again</button></div>');
      }
    });
  }

  function verifyPayment() {
    var pending = Pay.pendingOrder();
    Pay.refreshEntitlement(pending ? pending.orderId : null).then(function (r) {
      closeSheet();
      render();
      if (r.pro) toast('Pro is active on this device 🎉');
      else toast('No confirmed payment found yet', 'err');
    }).catch(function (err) {
      toast(err.message, 'err');
    });
  }

  function simulatePayment() {
    var pending = Pay.pendingOrder();
    if (!pending) { toast('Start a checkout first', 'err'); return; }
    Pay.simulatePayment(pending.orderId).then(function () {
      return Pay.refreshEntitlement(pending.orderId);
    }).then(function (r) {
      closeSheet();
      render();
      toast(r.pro ? 'Demo payment accepted — Pro unlocked' : 'Still pending');
    }).catch(function (err) { toast(err.message, 'err'); });
  }

  function restorePurchase() {
    Pay.refreshEntitlement(null).then(function (r) {
      render();
      toast(r.pro ? 'Purchase restored' : 'No purchase found for this device', r.pro ? 'ok' : 'err');
    }).catch(function (err) { toast(err.message, 'err'); });
  }

  function submitRedeem() {
    var code = ((document.getElementById('redeem-input') || {}).value || '').trim();
    if (!code) { toast('Paste your key', 'err'); return; }
    // try server first when available (authoritative), fall back to offline validation
    var attempt = Api.isConfigured() ? Pay.redeemOnline(code) : Promise.reject(new Error('offline'));
    attempt.then(function () {
      closeSheet(); render(); toast('Pro unlocked 🎉');
    }).catch(function () {
      var v = Pay.redeemOffline(code);
      if (v.ok) { closeSheet(); render(); toast('Pro unlocked (offline key) 🎉'); }
      else toast(v.error, 'err');
    });
  }

  /* ------------------------------------------------------------------ */
  /* settings / backup actions                                           */
  /* ------------------------------------------------------------------ */
  function gatewaySave() {
    var url = ((document.getElementById('gateway-url') || {}).value || '').trim();
    Api.setApiBase(url);
    var out = document.getElementById('gateway-status');
    if (!url) {
      if (out) out.innerHTML = 'Cleared — back to offline mode.';
      toast('Offline mode');
      return;
    }
    if (out) out.textContent = 'Testing ' + url + ' …';
    Api.health().then(function (res) {
      var gateway = (res && res.gateway) || 'unknown';
      var ready = res && res.webhookReady;
      if (out) out.innerHTML = '<span class="ok">Connected</span> · gateway: ' + esc(gateway) +
        (ready ? ' · webhook ready' : ' · <span class="err">webhook secret missing on the server</span>');
      toast('Payment gateway connected 🎉');
      render();
    }).catch(function (err) {
      if (out) out.innerHTML = '<span class="err">Could not reach that server:</span> ' + esc(err.message) +
        '<br>Check the URL, that the bridge is running, and that it uses https.';
    });
  }

  function saveSettings() {
    var patch = {
      name: (document.getElementById('set-name') || {}).value || 'Athlete',
      age: num((document.getElementById('set-age') || {}).value, 25),
      height: num((document.getElementById('set-height') || {}).value, 175),
      weight: num((document.getElementById('set-weight') || {}).value, 70),
      goal: (document.getElementById('set-goal') || {}).value,
      sex: (document.getElementById('set-sex') || {}).value
    };
    Store.setProfile(patch);
    Store.update(function (d) {
      d.settings.restSeconds = Math.max(10, num((document.getElementById('set-rest') || {}).value, 90));
    });
    render();
    toast('Saved');
  }

  function testServer() {
    var out = document.getElementById('server-status');
    var typed = ((document.getElementById('set-server') || {}).value || '').trim();
    Api.setApiBase(typed);
    if (out) out.textContent = 'Checking…';
    Api.health().then(function (res) {
      if (out) out.innerHTML = '<span class="ok">Connected</span> · gateway: ' + esc((res && res.gateway) || 'unknown') +
        ' · provider: ' + esc((res && res.provider) || 'unknown');
    }).catch(function (err) {
      if (out) out.innerHTML = '<span class="err">Failed:</span> ' + esc(err.message);
    });
  }

  function syncCode() {
    return ((document.getElementById('sync-code') || {}).value || '').trim();
  }

  function syncPush() {
    var code = syncCode();
    if (!code) { toast('Enter a sync code', 'err'); return; }
    Api.syncPush(code, { data: Store.data(), savedAt: Date.now() }).then(function () {
      toast('Backed up to your server');
    }).catch(function (err) { toast(err.message, 'err'); });
  }

  function syncPull() {
    var code = syncCode();
    if (!code) { toast('Enter a sync code', 'err'); return; }
    Api.syncPull(code).then(function (res) {
      if (!res || !res.data) { toast('Nothing stored under that code', 'err'); return; }
      Store.importJSON(JSON.stringify({ app: 'GymFlow', kind: 'backup', version: 1, data: res.data }));
      render();
      toast('Restored from your server');
    }).catch(function (err) { toast(err.message, 'err'); });
  }

  function exportData() {
    var json = Store.exportJSON();
    var blob;
    try {
      blob = new Blob([json], { type: 'application/json' });
    } catch (e) { }
    if (blob && global.URL && URL.createObjectURL) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'gymflow-backup-' + Store.todayKey() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      toast('Backup file created');
    } else {
      openSheet('<h3 class="h3">Your backup</h3><p class="tiny muted">Copy this text somewhere safe.</p>' +
        '<label class="field"><textarea rows="8" id="export-text">' + esc(json) + '</textarea></label>' +
        '<button class="btn btn-primary btn-block" data-action="close-sheet">Done</button>');
    }
  }

  function importData() {
    var text = ((document.getElementById('import-input') || {}).value || '');
    var res = Store.importJSON(text);
    if (!res.ok) { toast(res.error, 'err'); return; }
    closeSheet();
    render();
    toast('Backup imported');
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */
  function boot() {
    if (!Store.hasUsers()) ui.authMode = 'signup';
    Ads.refresh();
    render();
    if (Api.isConfigured() && Store.isSignedIn()) {
      Pay.refreshEntitlement(null).then(function (r) {
        if (r.pro && !Store.isPro()) render();
      }).catch(function () { });
    }
  }

  global.GymApp = { render: render, go: go, toast: toast };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
