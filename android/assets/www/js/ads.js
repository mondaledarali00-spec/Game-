/* Ad slots for the free tier.

   This is a self-hosted "house ads" system: the backend can serve sponsor
   cards (/api/ads) and the APK ships a few built-in cards so the free tier
   still shows ads with no network. Pro members never see any of them.

   Swapping in AdMob later = replace Ads.pickAd() with a real AdView and keep
   the same gating (Store.isPro()). */
(function (global) {
  'use strict';

  var CACHE_KEY = 'gymflow.ads.v1';
  var index = 0;

  function fallback() { return (GymData.HOUSE_ADS || []).slice(); }

  function cached() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) { return null; }
  }

  var Ads = {
    pool: cached() || fallback(),

    enabled: function () {
      if (Store.isPro()) return false;
      var d = Store.data();
      return !!(d && d.settings.showAds !== false);
    },

    refresh: function () {
      if (!Api.isConfigured()) return Promise.resolve(Ads.pool);
      return Api.ads().then(function (res) {
        var list = (res && res.ads) || [];
        if (list.length) {
          Ads.pool = list;
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch (e) { }
        }
        return Ads.pool;
      }).catch(function () { return Ads.pool; });
    },

    pickAd: function () {
      var pool = Ads.pool && Ads.pool.length ? Ads.pool : fallback();
      var ad = pool[index % pool.length];
      index++;
      return ad;
    },

    bannerHTML: function () {
      if (!Ads.enabled()) return '';
      var ad = Ads.pickAd();
      return '' +
        '<div class="ad-card" data-ad-id="' + ad.id + '">' +
        '  <div class="ad-label">Sponsored</div>' +
        '  <div class="ad-body">' +
        '    <div>' +
        '      <div class="ad-title">' + escapeHTML(ad.title || '') + '</div>' +
        '      <div class="ad-text">' + escapeHTML(ad.body || '') + '</div>' +
        '    </div>' +
        '  </div>' +
        '  <div class="ad-actions">' +
        '    <button class="btn btn-ghost btn-sm" data-action="ad-remove">Remove ads</button>' +
        '    <button class="btn btn-primary btn-sm" data-action="ad-cta" data-url="' + escapeAttr(ad.url || '') + '" data-cta="' + escapeAttr(ad.cta || 'Open') + '">' + escapeHTML(ad.cta || 'Open') + '</button>' +
        '  </div>' +
        '</div>';
    }
  };

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHTML(s); }

  global.Ads = Ads;
})(window);
