/* Local-first data store. Everything lives in localStorage so the app is
   completely functional in airplane mode. Accounts, workouts, water, weight
   history and the Pro entitlement are all persisted here. */
(function (global) {
  'use strict';

  var STATE_KEY = 'gymflow.state.v1';

  function todayKey(d) {
    d = d || new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function emptyUserData() {
    return {
      profile: { name: '', age: 25, height: 175, weight: 70, sex: 'male', goal: 'build-muscle', level: 'beginner', units: 'metric' },
      settings: { restSeconds: 90, vibrate: true, showAds: true },
      workouts: [],
      weights: [],
      water: {},
      streak: { last: null, count: 0 },
      pro: { active: false, plan: null, since: null, orderId: null, source: null, expires: null },
      activeSession: null,
      onboardingDone: false
    };
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STATE_KEY); } catch (e) { }
    if (!raw) return { version: 1, users: {}, session: null, data: {} };
    try {
      var s = JSON.parse(raw);
      s.users = s.users || {};
      s.data = s.data || {};
      return s;
    } catch (e) {
      return { version: 1, users: {}, session: null, data: {} };
    }
  }

  var state = load();

  function save() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('save failed', e); }
  }

  function userKey(name) { return String(name || '').trim().toLowerCase(); }

  function currentKey() { return state.session ? userKey(state.session) : null; }

  function currentUser() {
    var k = currentKey();
    return k ? state.users[k] || null : null;
  }

  function currentData() {
    var k = currentKey();
    if (!k) return null;
    if (!state.data[k]) state.data[k] = emptyUserData();
    var d = state.data[k];
    // additive migration for older saved blobs
    var base = emptyUserData();
    Object.keys(base).forEach(function (key) { if (d[key] === undefined) d[key] = base[key]; });
    return d;
  }

  var Store = {
    state: state,
    todayKey: todayKey,
    save: save,

    hasUsers: function () { return Object.keys(state.users).length > 0; },
    isSignedIn: function () { return !!currentUser(); },
    user: currentUser,
    data: currentData,

    signup: function (name, password) {
      var k = userKey(name);
      if (!k) return { ok: false, error: 'Enter a name.' };
      if (k.length < 3) return { ok: false, error: 'Name needs at least 3 characters.' };
      if (!password || password.length < 4) return { ok: false, error: 'Password needs at least 4 characters.' };
      if (state.users[k]) return { ok: false, error: 'That account already exists on this device.' };
      var salt = GymHash.randomId(16);
      state.users[k] = {
        username: k,
        display: name.trim(),
        salt: salt,
        hash: GymHash.hashPassword(password, salt),
        created: Date.now()
      };
      state.data[k] = emptyUserData();
      state.data[k].profile.name = name.trim();
      state.session = k;
      save();
      return { ok: true };
    },

    login: function (name, password) {
      var k = userKey(name);
      var u = state.users[k];
      if (!u) return { ok: false, error: 'No account with that name on this device.' };
      if (u.hash !== GymHash.hashPassword(password, u.salt)) return { ok: false, error: 'Wrong password.' };
      state.session = k;
      save();
      return { ok: true };
    },

    logout: function () { state.session = null; save(); },

    deleteAccount: function () {
      var k = currentKey();
      if (!k) return;
      delete state.users[k];
      delete state.data[k];
      state.session = null;
      save();
    },

    update: function (fn) {
      var d = currentData();
      if (!d) return;
      fn(d);
      save();
    },

    /* ---------- profile ---------- */
    setProfile: function (patch) {
      Store.update(function (d) {
        Object.keys(patch).forEach(function (k) { d.profile[k] = patch[k]; });
        d.onboardingDone = true;
      });
    },

    /* ---------- body weight log ---------- */
    logWeight: function (kg) {
      Store.update(function (d) {
        var key = todayKey();
        var found = false;
        for (var i = 0; i < d.weights.length; i++) {
          if (d.weights[i].date === key) { d.weights[i].kg = kg; found = true; }
        }
        if (!found) d.weights.push({ date: key, kg: kg });
        d.weights.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        d.profile.weight = kg;
      });
    },

    /* ---------- water ---------- */
    addWater: function (ml) {
      var out = 0;
      Store.update(function (d) {
        var key = todayKey();
        var v = (d.water[key] || 0) + ml;
        d.water[key] = Math.max(0, v);
        out = d.water[key];
      });
      return out;
    },

    waterToday: function () {
      var d = currentData();
      return d ? (d.water[todayKey()] || 0) : 0;
    },

    /* ---------- workouts ---------- */
    finishWorkout: function (workout) {
      Store.update(function (d) {
        d.workouts.unshift(workout);
        if (d.workouts.length > 400) d.workouts.length = 400;
        var key = todayKey();
        if (d.streak.last !== key) {
          var y = new Date();
          y.setDate(y.getDate() - 1);
          d.streak.count = (d.streak.last === todayKey(y)) ? (d.streak.count + 1) : 1;
          d.streak.last = key;
        }
        d.activeSession = null;
      });
    },

    saveActiveSession: function (session) {
      Store.update(function (d) { d.activeSession = session; });
    },

    clearActiveSession: function () {
      Store.update(function (d) { d.activeSession = null; });
    },

    workoutsThisWeek: function () {
      var d = currentData();
      if (!d) return 0;
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 6);
      var ck = todayKey(cutoff);
      return d.workouts.filter(function (w) { return w.date.slice(0, 10) >= ck; }).length;
    },

    volumeThisWeek: function () {
      var d = currentData();
      if (!d) return 0;
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 6);
      var ck = todayKey(cutoff);
      return d.workouts.filter(function (w) { return w.date.slice(0, 10) >= ck; })
        .reduce(function (sum, w) { return sum + (w.volume || 0); }, 0);
    },

    personalRecords: function () {
      var d = currentData();
      if (!d) return [];
      var best = {};
      d.workouts.forEach(function (w) {
        (w.exercises || []).forEach(function (ex) {
          (ex.sets || []).forEach(function (s) {
            if (!s.done || !s.weight) return;
            var oneRm = Math.round(s.weight * (1 + (s.reps || 1) / 30));
            if (!best[ex.name] || best[ex.name].oneRm < oneRm) {
              best[ex.name] = { name: ex.name, weight: s.weight, reps: s.reps, oneRm: oneRm, date: w.date };
            }
          });
        });
      });
      return Object.keys(best).map(function (k) { return best[k]; })
        .sort(function (a, b) { return b.oneRm - a.oneRm; }).slice(0, 10);
    },

    /* ---------- Pro entitlement ---------- */
    isPro: function () {
      var d = currentData();
      if (!d || !d.pro) return false;
      if (!d.pro.active) return false;
      if (d.pro.expires && Date.now() > d.pro.expires) return false;
      return true;
    },

    grantPro: function (info) {
      Store.update(function (d) {
        d.pro = {
          active: true,
          plan: info.plan || 'lifetime',
          since: Date.now(),
          orderId: info.orderId || null,
          source: info.source || 'gateway',
          expires: info.expires || null
        };
        d.settings.showAds = false;
      });
    },

    revokePro: function () {
      Store.update(function (d) {
        d.pro = { active: false, plan: null, since: null, orderId: null, source: null, expires: null };
        d.settings.showAds = true;
      });
    },

    /* ---------- backup ---------- */
    exportJSON: function () {
      var u = currentUser();
      var d = currentData();
      return JSON.stringify({
        app: 'GymFlow', kind: 'backup', version: 1,
        exportedAt: new Date().toISOString(),
        user: u ? { display: u.display, created: u.created } : null,
        data: d
      }, null, 2);
    },

    importJSON: function (text) {
      var parsed;
      try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: 'That is not valid JSON.' }; }
      if (!parsed || parsed.app !== 'GymFlow' || !parsed.data) return { ok: false, error: 'Not a GymFlow backup file.' };
      var k = currentKey();
      if (!k) return { ok: false, error: 'Sign in first.' };
      var base = emptyUserData();
      Object.keys(base).forEach(function (key) { if (parsed.data[key] === undefined) parsed.data[key] = base[key]; });
      state.data[k] = parsed.data;
      save();
      return { ok: true };
    }
  };

  global.Store = Store;
})(window);
