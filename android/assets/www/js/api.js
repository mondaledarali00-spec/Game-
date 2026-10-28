/* Thin API client around the GymFlow backend (which itself talks to YOUPI PG).
   Every call is best-effort: the app must keep working with no network at all. */
(function (global) {
  'use strict';

  function config() { return global.GYMFLOW_CONFIG || {}; }

  function apiBase() {
    var override = '';
    try { override = localStorage.getItem('gymflow.apiBase') || ''; } catch (e) { }
    var base = override || config().apiBase || '';
    if (base && base.charAt(base.length - 1) === '/') base = base.slice(0, -1);
    return base;
  }

  function isConfigured() { return !!apiBase(); }

  function url(path) { return apiBase() + path; }

  function request(path, options, timeoutMs) {
    options = options || {};
    var controller = null;
    var timer = null;
    var opts = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    if (options.body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(options.body);
    }
    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      opts.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, timeoutMs || 12000);
    }
    return fetch(url(path), opts).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
        if (!res.ok) {
          var err = new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  var Api = {
    apiBase: apiBase,
    isConfigured: isConfigured,
    setApiBase: function (base) {
      try {
        if (base) localStorage.setItem('gymflow.apiBase', base.replace(/\/+$/, ''));
        else localStorage.removeItem('gymflow.apiBase');
      } catch (e) { }
    },
    health: function () { return request('/api/health', {}, 4000); },
    config: function () { return request('/api/config', {}, 6000); },
    ads: function () { return request('/api/ads', {}, 6000); },

    createCheckout: function (planId, extra) {
      var body = {
        planId: planId,
        deviceId: GymHash.deviceId(),
        user: (Store.user() || {}).display || null
      };
      if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
      return request('/api/checkout', { method: 'POST', body: body });
    },
    entitlement: function (orderId) {
      var q = '/api/entitlement?deviceId=' + encodeURIComponent(GymHash.deviceId());
      if (orderId) q += '&orderId=' + encodeURIComponent(orderId);
      return request(q, {}, 8000);
    },
    redeem: function (code) {
      return request('/api/redeem', {
        method: 'POST',
        body: { code: code, deviceId: GymHash.deviceId(), user: (Store.user() || {}).display || null }
      });
    },
    syncPush: function (syncCode, payload) {
      return request('/api/sync/' + encodeURIComponent(syncCode), { method: 'PUT', body: payload });
    },
    syncPull: function (syncCode) {
      return request('/api/sync/' + encodeURIComponent(syncCode));
    }
  };

  global.Api = Api;
})(window);
