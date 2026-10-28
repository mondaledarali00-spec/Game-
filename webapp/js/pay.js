/* Pro unlock / payment layer.
   Flow A (online, real money): app -> GymFlow backend -> YOUPI PG payment session
                                  -> UPI checkout page -> gateway webhook -> backend
                                  -> app polls entitlement -> Pro unlocked.
   Flow B (fully offline):      an offline licence key (GF-...) that is validated
                                on-device, no network needed.
   */
(function (global) {
  'use strict';

  // NOTE: this secret is shipped inside the APK. That is fine for a local
  // "nice to have" offline unlock, but it is NOT a secure licensing system:
  // anyone can reverse the APK and mint keys. Use the server-side redeem
  // endpoint (backend /api/redeem) for anything that matters.
  var OFFLINE_SECRET = 'gymflow-offline-license-v1';
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function b32encode(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 128) bytes.push(c);
      else { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
    }
    var bits = 0, value = 0, out = '';
    for (var j = 0; j < bytes.length; j++) {
      value = (value << 8) | bytes[j];
      bits += 8;
      while (bits >= 5) {
        out += B32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
  }

  function b32decode(str) {
    var bits = 0, value = 0, bytes = [];
    str = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
    for (var i = 0; i < str.length; i++) {
      var idx = B32.indexOf(str.charAt(i));
      if (idx < 0) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    var out = '';
    for (var j = 0; j < bytes.length; j++) out += String.fromCharCode(bytes[j]);
    return out;
  }

  function offlineSignature(payload) {
    return GymHash.sha256('GF1|' + payload + '|' + OFFLINE_SECRET).slice(0, 24).toUpperCase();
  }

  function makeOfflineCode(plan, days, nonce) {
    var exp = days ? Date.now() + days * 86400000 : null;
    var payload = b32encode(JSON.stringify({ p: plan || 'lifetime', e: exp, n: nonce || GymHash.randomId(6) }));
    return 'GF-' + payload + '-' + offlineSignature(payload);
  }

  function validateOfflineCode(code) {
    var parts = String(code || '').trim().toUpperCase().split('-');
    // codes look like GF-<payload>-<sig>; payload itself never contains '-'
    if (parts.length < 3) return { ok: false, error: 'That code does not look right.' };
    var sig = parts.pop();
    parts.shift();
    var payload = parts.join('-');
    if (offlineSignature(payload) !== sig) return { ok: false, error: 'Invalid licence key.' };
    var info;
    try { info = JSON.parse(b32decode(payload)); } catch (e) { return { ok: false, error: 'Corrupt licence key.' }; }
    if (info.e && Date.now() > info.e) return { ok: false, error: 'That licence key has expired.' };
    return { ok: true, info: info };
  }

  function isNative() {
    return !!(global.GymFlowNative && typeof global.GymFlowNative.open === 'function');
  }

  function openExternal(target) {
    if (!target) return;
    if (isNative()) {
      try { global.GymFlowNative.open(target); return; } catch (e) { }
    }
    var w = window.open(target, '_blank');
    if (!w) window.location.href = target;
  }

  var Pay = {
    plans: function () { return (global.GYMFLOW_CONFIG || {}).plans || []; },
    plan: function (id) {
      return Pay.plans().filter(function (p) { return p.id === id; })[0] || Pay.plans()[0];
    },
    isNative: isNative,
    openExternal: openExternal,
    makeOfflineCode: makeOfflineCode,
    validateOfflineCode: validateOfflineCode,

    /* Create a gateway session and hand the customer off to the UPI page. */
    startCheckout: function (planId) {
      if (!Api.isConfigured()) {
        return Promise.reject(new Error('No payment server configured. Open Settings -> Cloud server, or redeem a licence key.'));
      }
      return Api.createCheckout(planId).then(function (res) {
        if (!res || !res.checkoutUrl) throw new Error('Gateway did not return a checkout URL.');
        try {
          localStorage.setItem('gymflow.pendingOrder', JSON.stringify({
            orderId: res.orderId, paymentId: res.paymentId, planId: planId, createdAt: Date.now()
          }));
        } catch (e) { }
        openExternal(res.checkoutUrl);
        return res;
      });
    },

    pendingOrder: function () {
      try { return JSON.parse(localStorage.getItem('gymflow.pendingOrder') || 'null'); } catch (e) { return null; }
    },

    clearPending: function () {
      try { localStorage.removeItem('gymflow.pendingOrder'); } catch (e) { }
    },

    /* Ask the backend whether this device already owns Pro. */
    refreshEntitlement: function (orderId) {
      if (!Api.isConfigured()) return Promise.reject(new Error('No payment server configured.'));
      return Api.entitlement(orderId).then(function (res) {
        if (res && res.pro) {
          Store.grantPro({ plan: res.plan, orderId: res.orderId, source: res.source || 'gateway', expires: res.expires });
          if (res.status === 'pending') {
            // money observed but not yet reconciled: still unlock, backend flagged it
            return { pro: true, status: res.status, note: res.note };
          }
          Pay.clearPending();
          return { pro: true, status: res.status };
        }
        return { pro: false, status: (res && res.status) || 'unknown' };
      });
    },

    /* Poll until the gateway confirms, or the window expires. */
    poll: function (orderId, onTick, timeoutMs) {
      var started = Date.now();
      var limit = timeoutMs || 5 * 60 * 1000;
      var cancelled = false;
      function loop() {
        if (cancelled) return Promise.resolve({ pro: false, cancelled: true });
        return Pay.refreshEntitlement(orderId).then(function (r) {
          if (onTick) onTick(r);
          if (r.pro) return r;
          if (Date.now() - started > limit) return { pro: false, timeout: true };
          return new Promise(function (resolve) {
            setTimeout(function () { resolve(loop()); }, 5000);
          });
        }).catch(function (err) {
          if (onTick) onTick({ pro: false, error: err.message });
          if (Date.now() - started > limit) return { pro: false, timeout: true, error: err.message };
          return new Promise(function (resolve) {
            setTimeout(function () { resolve(loop()); }, 6000);
          });
        });
      }
      var promise = loop();
      promise.cancel = function () { cancelled = true; };
      return promise;
    },

    redeemOnline: function (code) {
      if (!Api.isConfigured()) return Promise.reject(new Error('No payment server configured.'));
      return Api.redeem(code).then(function (res) {
        if (res && res.pro) Store.grantPro({ plan: res.plan, source: 'licence', expires: res.expires });
        return res;
      });
    },

    redeemOffline: function (code) {
      var v = validateOfflineCode(code);
      if (!v.ok) return v;
      Store.grantPro({
        plan: v.info.p,
        source: 'offline-licence',
        expires: v.info.e || null,
        orderId: 'OFFLINE-' + (v.info.n || '')
      });
      return v;
    },

    simulatePayment: function (orderId) {
      if (!Api.isConfigured()) return Promise.reject(new Error('No payment server configured.'));
      return fetch(Api.apiBase() + '/api/mock/pay/' + encodeURIComponent(orderId), { method: 'POST' })
        .then(function (r) { return r.json(); });
    }
  };

  global.Pay = Pay;
})(window);
