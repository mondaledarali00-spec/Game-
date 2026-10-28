/* Dependency-free canvas charts (line + bars) with HiDPI support. */
(function (global) {
  'use strict';

  function setup(canvas) {
    var dpr = global.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = rect.width || canvas.clientWidth || 320;
    var h = rect.height || canvas.clientHeight || 160;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function niceBounds(values) {
    if (!values.length) return { min: 0, max: 1 };
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (min === max) { min -= 1; max += 1; }
    var pad = (max - min) * 0.15;
    return { min: min - pad, max: max + pad };
  }

  var Charts = {
    line: function (canvas, points, opts) {
      opts = opts || {};
      var s = setup(canvas);
      var ctx = s.ctx, w = s.w, h = s.h;
      var padL = 38, padR = 12, padT = 14, padB = 22;
      var values = points.map(function (p) { return p.value; });
      if (!points.length) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText('No data yet', 12, h / 2);
        return;
      }
      var b = niceBounds(values);
      var plotW = w - padL - padR, plotH = h - padT - padB;

      // grid + y labels
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.lineWidth = 1;
      for (var g = 0; g <= 3; g++) {
        var y = padT + plotH * (g / 3);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        var v = b.max - (b.max - b.min) * (g / 3);
        ctx.fillText(v.toFixed(1), 4, y + 3);
      }

      function px(i) {
        return padL + (points.length === 1 ? plotW / 2 : plotW * (i / (points.length - 1)));
      }
      function py(v) {
        return padT + plotH * (1 - (v - b.min) / (b.max - b.min));
      }

      // area fill
      var grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, 'rgba(163,230,53,0.35)');
      grad.addColorStop(1, 'rgba(163,230,53,0.02)');
      ctx.beginPath();
      ctx.moveTo(px(0), py(points[0].value));
      points.forEach(function (p, i) { ctx.lineTo(px(i), py(p.value)); });
      ctx.lineTo(px(points.length - 1), padT + plotH);
      ctx.lineTo(px(0), padT + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // line
      ctx.beginPath();
      points.forEach(function (p, i) {
        if (i === 0) ctx.moveTo(px(i), py(p.value));
        else ctx.lineTo(px(i), py(p.value));
      });
      ctx.strokeStyle = '#a3e635';
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // dots
      ctx.fillStyle = '#0b0f0c';
      points.forEach(function (p, i) {
        ctx.beginPath();
        ctx.arc(px(i), py(p.value), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#a3e635';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(163,230,53,0.35)';
        ctx.stroke();
      });

      // x labels (first / last)
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = '10px system-ui, sans-serif';
      if (points.length) {
        ctx.fillText(shortDate(points[0].label), padL, h - 6);
        if (points.length > 1) {
          var lastLabel = shortDate(points[points.length - 1].label);
          ctx.fillText(lastLabel, w - padR - ctx.measureText(lastLabel).width, h - 6);
        }
      }
    },

    bars: function (canvas, labels, values, opts) {
      opts = opts || {};
      var s = setup(canvas);
      var ctx = s.ctx, w = s.w, h = s.h;
      var padL = 30, padR = 10, padT = 12, padB = 22;
      var plotW = w - padL - padR, plotH = h - padT - padB;
      var max = Math.max.apply(null, values.concat([1]));

      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, padT + plotH);
      ctx.lineTo(w - padR, padT + plotH);
      ctx.stroke();

      var n = values.length || 1;
      var slot = plotW / n;
      var barW = Math.min(26, slot * 0.55);

      values.forEach(function (v, i) {
        var bh = max ? (v / max) * plotH : 0;
        var x = padL + slot * i + (slot - barW) / 2;
        var y = padT + plotH - bh;
        var grad = ctx.createLinearGradient(0, y, 0, padT + plotH);
        grad.addColorStop(0, '#a3e635');
        grad.addColorStop(1, 'rgba(163,230,53,0.25)');
        ctx.fillStyle = grad;
        var r = Math.min(5, barW / 2);
        ctx.beginPath();
        ctx.moveTo(x, padT + plotH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, padT + plotH);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '9px system-ui, sans-serif';
        var label = String(labels[i] || '');
        ctx.fillText(label, x + barW / 2 - ctx.measureText(label).width / 2, h - 7);
      });
    }
  };

  function shortDate(label) {
    if (!label) return '';
    var parts = String(label).split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1];
    return label;
  }

  global.Charts = Charts;
})(window);
