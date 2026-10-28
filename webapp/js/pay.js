/* Pro unlock / payment layer.

   Three ways to get Pro, all driven from here:

   A. DIRECT UPI (default, money → your own UPI ID)
      app builds a upi://pay deep link + QR for the merchant VPA with a unique
      reference, the customer pays from any UPI app, then types the 12-digit UTR.
      The backend confirms it either automatically (a YouPI PG bank-credit
      webhook carrying the same UTR) or with one tap in the /admin console.

   B. GATEWAY SESSION (YouPI PG hosted checkout)
      backend creates a payment session, the customer pays on YouPI's page, the
      signed webhook unlocks the device. Nothing typed by hand.

   C. OFFLINE LICENCE KEY (GF-...)
      validated on-device, works with zero network.
*/
(function (global) {
  'use strict';

  // This secret ships inside the APK. Fine for gifting Pro; NOT a secure
  // licensing system (anyone can unpack the APK and mint keys). Prefer the
  // server-side redeem endpoint for anything that matters.
  var OFFLINE_SECRET = 'gymflow-offline-license-v1';
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  /* ------------------------------------------------------------------ */
  /* licence keys                                                        */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */
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

  function merchant() {
    var cfg = (global.GYMFLOW_CONFIG || {}).merchant || {};
    return {
      upiId: cfg.upiId || '',
      payeeName: cfg.payeeName || 'GymFlow',
      merchantCode: cfg.merchantCode || ''
    };
  }

  function localRef(planId) {
    var stamp = Date.now().toString(36).toUpperCase();
    var plan = String(planId || 'pro').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
    return 'GYM' + plan + stamp + GymHash.randomId(4).toUpperCase();
  }

  /** upi://pay?... deep link for the configured merchant VPA */
  function upiUri(opts) {
    return QR.upiUri({
      pa: opts.pa || merchant().upiId,
      pn: opts.pn || merchant().payeeName,
      am: Number(opts.am).toFixed(2),
      cu: 'INR',
      tn: opts.tn,
      tr: opts.tr,
      mc: merchant().merchantCode
    });
  }

  /** Which apps can open that link (Android schemes first, generic last). */
  function appLinks(uri) {
    var query = uri.replace('upi://pay?', '');
    return [
      { id: 'any', label: 'Open my UPI app', icon: '📲', url: uri },
      { id: 'gpay', label: 'Google Pay', icon: '🟢', url: 'tez://upi/pay?' + query },
      { id: 'phonepe', label: 'PhonePe', icon: '🟣', url: 'phonepe://pay?' + query },
      { id: 'paytm', label: 'Paytm', icon: '🔵', url: 'paytmmp://pay?' + query },
      { id: 'other', label: 'Other / bank app', icon: '🏦', url: uri }
    ];
  }

  /* ------------------------------------------------------------------ */
  /* A. direct-to-VPA orders                                             */
  /* ------------------------------------------------------------------ */
  function startDirectUpi(planId) {
    var plan = Pay.plan(planId);
    var ref = localRef(planId);
    var local = {
      ref: ref,
      planId: plan.id,
      amount: plan.amount,
      upiId: merchant().upiId,
      createdAt: Date.now(),
      offline: !Api.isConfigured()
    };
    local.uri = upiUri({ am: plan.amount, tn: 'GymFlow ' + plan.label + ' ' + ref, tr: ref });
    try { localStorage.setItem('gymflow.upiOrder', JSON.stringify(local)); } catch (e) { }

    if (!Api.isConfigured()) return Promise.resolve(local);

    return Api.createUpiOrder(planId).then(function (res) {
      var order = {
        ref: res.ref,
        planId: res.planId,
        amount: res.amount,
        upiId: res.upiId || merchant().upiId,
        note: res.note,
        createdAt: Date.now(),
        offline: false,
        uri: res.upiUri || local.uri
      };
      try { localStorage.setItem('gymflow.upiOrder', JSON.stringify(order)); } catch (e) { }
      return order;
    }).catch(function (err) {
      local.offline = true;
      local.warning = err.message;
      return local;
    });
  }

  function currentUpiOrder() {
    try { return JSON.parse(localStorage.getItem('gymflow.upiOrder') || 'null'); } catch (e) { return null; }
  }

  function clearUpiOrder() {
    try { localStorage.removeItem('gymflow.upiOrder'); } catch (e) { }
  }

  function submitUtr(ref, utr) {
    var clean = String(utr || '').replace(/[^0-9]/g, '');
    if (clean.length !== 12) return Promise.reject(new Error('A UPI reference (UTR) is exactly 12 digits.'));
    if (!Api.isConfigured()) return Promise.resolve({ offline: true, status: 'awaiting_confirmation' });
    return Api.submitUtr(ref, clean);
  }

  function checkUpiOrder(ref) {
    if (!Api.isConfigured()) return Promise.resolve({ pro: false, status: 'offline' });
    return Api.upiStatus(ref).then(function (res) {
      if (res && res.pro) {
        var order = currentUpiOrder();
        Store.grantPro({ plan: (order && order.planId) || res.plan, orderId: ref, source: 'upi-verified' });
        clearUpiOrder();
      }
      return res || { pro: false };
    });
  }

  function watchUpiOrder(ref, onTick, timeoutMs) {
    var started = Date.now();
    var limit = timeoutMs || 15 * 60 * 1000;
    var stopped = false;
    function loop() {
      if (stopped) return Promise.resolve({ pro: false, stopped: true });
      return checkUpiOrder(ref).then(function (r) {
        if (onTick) onTick(r);
        if (r.pro) return r;
        if (Date.now() - started > limit) return { pro: false, timeout: true };
        return new Promise(function (resolve) { setTimeout(function () { resolve(loop()); }, 5000); });
      }).catch(function (err) {
        if (onTick) onTick({ pro: false, error: err.message });
        if (Date.now() - started > limit) return { pro: false, timeout: true, error: err.message };
        return new Promise(function (resolve) { setTimeout(function () { resolve(loop()); }, 8000); });
      });
    }
    var promise = loop();
    promise.stop = function () { stopped = true; };
    return promise;
  }

  /* ------------------------------------------------------------------ */
  /* B. YOUPI hosted checkout session                                    */
  /* ------------------------------------------------------------------ */
  function startCheckout(planId) {
    if (!Api.isConfigured()) {
      return Promise.reject(new Error('No payment server configured. Use direct UPI or redeem a licence key.'));
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
  }

  function pendingOrder() {
    try { return JSON.parse(localStorage.getItem('gymflow.pendingOrder') || 'null'); } catch (e) { return null; }
  }

  function clearPending() {
    try { localStorage.removeItem('gymflow.pendingOrder'); } catch (e) { }
  }

  function refreshEntitlement(orderId) {
    if (!Api.isConfigured()) return Promise.reject(new Error('No payment server configured.'));
    return Api.entitlement(orderId).then(function (res) {
      if (res && res.pro) {
        Store.grantPro({
          plan: res.plan,
          orderId: res.orderId,
          source: res.source || 'gateway-observed',
          expires: res.expires
        });
        clearPending();
        return { pro: true, status: res.status, note: res.note };
      }
      return { pro: false, status: (res && res.status) || 'unknown' };
    });
  }

  function poll(orderId, onTick, timeoutMs) {
    var started = Date.now();
    var limit = timeoutMs || 5 * 60 * 1000;
    var cancelled = false;
    function loop() {
      if (cancelled) return Promise.resolve({ pro: false, cancelled: true });
      return refreshEntitlement(orderId).then(function (r) {
        if (onTick) onTick(r);
        if (r.pro) return r;
        if (Date.now() - started > limit) return { pro: false, timeout: true };
        return new Promise(function (resolve) { setTimeout(function () { resolve(loop()); }, 5000); });
      }).catch(function (err) {
        if (onTick) onTick({ pro: false, error: err.message });
        if (Date.now() - started > limit) return { pro: false, timeout: true, error: err.message };
        return new Promise(function (resolve) { setTimeout(function () { resolve(loop()); }, 6000); });
      });
    }
    var promise = loop();
    promise.cancel = function () { cancelled = true; };
    return promise;
  }

  function redeemOnline(code) {
    if (!Api.isConfigured()) return Promise.reject(new Error('No payment server configured.'));
    return Api.redeem(code).then(function (res) {
      if (res && res.pro) Store.grantPro({ plan: res.plan, source: 'licence', expires: res.expires });
      return res;
    });
  }

  function redeemOffline(code) {
    var v = validateOfflineCode(code);
    if (!v.ok) return v;
    Store.grantPro({
      plan: v.info.p,
      source: 'offline-licence',
      expires: v.info.e || null,
      orderId: 'OFFLINE-' + (v.info.n || '')
    });
    return v;
  }

  function simulatePayment(orderId) {
    if (!Api.isConfigured()) return Promise.reject(new Error('No payment server configured.'));
    return fetch(Api.apiBase() + '/api/mock/pay/' + encodeURIComponent(orderId), { method: 'POST' })
      .then(function (r) { return r.json(); });
  }

  /* ------------------------------------------------------------------ */
  var Pay = {
    plans: function () { return (global.GYMFLOW_CONFIG || {}).plans || []; },
    plan: function (id) {
      return Pay.plans().filter(function (p) { return p.id === id; })[0] || Pay.plans()[0];
    },
    isNative: isNative,
    openExternal: openExternal,
    makeOfflineCode: makeOfflineCode,
    validateOfflineCode: validateOfflineCode,

    merchant: merchant,
    upiUri: upiUri,
    appLinks: appLinks,
    startDirectUpi: startDirectUpi,
    currentUpiOrder: currentUpiOrder,
    clearUpiOrder: clearUpiOrder,
    submitUtr: submitUtr,
    checkUpiOrder: checkUpiOrder,
    watchUpiOrder: watchUpiOrder,

    startCheckout: startCheckout,
    pendingOrder: pendingOrder,
    clearPending: clearPending,
    refreshEntitlement: refreshEntitlement,
    poll: poll,
    redeemOnline: redeemOnline,
    redeemOffline: redeemOffline,
    simulatePayment: simulatePayment
  };

  global.Pay = Pay;
})(window);
