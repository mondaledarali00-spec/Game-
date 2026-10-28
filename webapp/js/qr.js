/* Minimal QR Code encoder (byte mode, ECC level M) — no dependencies.
   Written for GymFlow so the app can render a scannable UPI QR code offline.
   Supports versions 1-20 (up to ~660 bytes at ECC M), which is far more than a
   UPI payment URI needs.

   Usage:
     var m = QR.encode('upi://pay?pa=...');   // -> { size, modules[][], version }
     QR.renderToCanvas(canvas, m, { margin: 4, dark:'#000', light:'#fff' });
*/
(function (global) {
  'use strict';

  /* ---- RS block table for ECC level M: [ecPerBlock, blocks1, dataPer1, blocks2, dataPer2] */
  var RS_M = {
    1: [10, 1, 16, 0, 0],
    2: [16, 1, 28, 0, 0],
    3: [26, 1, 44, 0, 0],
    4: [18, 2, 32, 0, 0],
    5: [24, 2, 43, 0, 0],
    6: [16, 4, 27, 0, 0],
    7: [18, 4, 31, 0, 0],
    8: [22, 2, 38, 2, 39],
    9: [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44],
    11: [30, 1, 50, 4, 51],
    12: [22, 6, 36, 2, 37],
    13: [22, 8, 37, 1, 38],
    14: [24, 4, 40, 5, 41],
    15: [24, 5, 41, 5, 42],
    16: [28, 7, 45, 3, 46],
    17: [28, 10, 46, 1, 47],
    18: [26, 9, 43, 4, 44],
    19: [26, 3, 44, 11, 45],
    20: [26, 3, 41, 13, 42]
  };

  /* ---- alignment pattern centres ---- */
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
    11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66],
    15: [6, 26, 48, 70], 16: [6, 26, 50, 74], 17: [6, 30, 54, 78],
    18: [6, 30, 56, 82], 19: [6, 30, 58, 86], 20: [6, 34, 62, 90]
  };

  /* ---- Galois field tables for Reed-Solomon ---- */
  var EXP = new Array(512);
  var LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGenerator(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecCount) {
    var gen = rsGenerator(ecCount);
    var res = new Array(ecCount).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ res[0];
      res.shift();
      res.push(0);
      if (factor !== 0) {
        for (var j = 0; j < ecCount; j++) res[j] ^= gfMul(gen[j + 1], factor);
      }
    }
    return res;
  }

  /* ---- bit buffer ---- */
  function BitBuffer() { this.bits = []; }
  BitBuffer.prototype.put = function (num, length) {
    for (var i = length - 1; i >= 0; i--) this.bits.push((num >>> i) & 1);
  };
  BitBuffer.prototype.length = function () { return this.bits.length; };

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function dataCapacity(version) {
    var t = RS_M[version];
    return t[1] * t[2] + t[3] * t[4];
  }

  function pickVersion(byteLen) {
    for (var v = 1; v <= 20; v++) {
      var header = 4 + (v < 10 ? 8 : 16);
      if (Math.floor((dataCapacity(v) * 8 - header) / 8) >= byteLen) return v;
    }
    throw new Error('QR: data too long (' + byteLen + ' bytes)');
  }

  /* ---- build the final codeword stream ---- */
  function buildCodewords(bytes, version) {
    var buf = new BitBuffer();
    buf.put(4, 4);                                  // byte mode
    buf.put(bytes.length, version < 10 ? 8 : 16);    // char count
    for (var i = 0; i < bytes.length; i++) buf.put(bytes[i], 8);

    var capacityBits = dataCapacity(version) * 8;
    var terminator = Math.min(4, capacityBits - buf.length());
    if (terminator > 0) buf.put(0, terminator);
    while (buf.length() % 8 !== 0) buf.bits.push(0);

    var codewords = [];
    for (var b = 0; b < buf.bits.length; b += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | buf.bits[b + k];
      codewords.push(byte);
    }
    var pad = [0xec, 0x11];
    var p = 0;
    while (codewords.length < dataCapacity(version)) codewords.push(pad[p++ % 2]);

    /* split into RS blocks */
    var t = RS_M[version];
    var ecPer = t[0];
    var blocks = [];
    var offset = 0;
    var i2;
    for (i2 = 0; i2 < t[1]; i2++) {
      blocks.push(codewords.slice(offset, offset + t[2]));
      offset += t[2];
    }
    for (i2 = 0; i2 < t[3]; i2++) {
      blocks.push(codewords.slice(offset, offset + t[4]));
      offset += t[4];
    }

    var withEc = blocks.map(function (blk) {
      return { data: blk, ec: rsEncode(blk, ecPer) };
    });

    /* interleave */
    var result = [];
    var maxData = Math.max.apply(null, withEc.map(function (b) { return b.data.length; }));
    for (var c = 0; c < maxData; c++) {
      withEc.forEach(function (b2) { if (c < b2.data.length) result.push(b2.data[c]); });
    }
    for (var e = 0; e < ecPer; e++) {
      withEc.forEach(function (b3) { result.push(b3.ec[e]); });
    }
    return result;
  }

  /* ---- matrix helpers -------------------------------------------------
     A cell is `null` until something claims it. Function patterns (finders,
     separators, timing, alignment, format/version info) are written first and
     become non-null, so the data zigzag automatically skips them. This mirrors
     the canonical algorithm and keeps reserved-map bookkeeping out of the way. */
  function Matrix(version) {
    this.version = version;
    this.size = version * 4 + 17;
    this.data = [];
    for (var r = 0; r < this.size; r++) {
      this.data.push(new Array(this.size).fill(null));
    }
  }
  Matrix.prototype.set = function (r, c, v) {
    if (r < 0 || c < 0 || r >= this.size || c >= this.size) return;
    this.data[r][c] = v ? 1 : 0;
  };
  Matrix.prototype.free = function (r, c) { return this.data[r][c] === null; };

  function placeFinder(m, row, col) {
    for (var r = -1; r <= 7; r++) {
      for (var c = -1; c <= 7; c++) {
        var rr = row + r, cc = col + c;
        if (rr < 0 || cc < 0 || rr >= m.size || cc >= m.size) continue;
        var on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        m.set(rr, cc, on ? 1 : 0);
      }
    }
  }

  function placeAlignment(m, version) {
    var pos = ALIGN[version];
    var last = pos.length - 1;
    for (var i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        // skip the three corners that collide with finder patterns
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
        var row = pos[i], col = pos[j];
        for (var r = -2; r <= 2; r++) {
          for (var c = -2; c <= 2; c++) {
            var on = Math.max(Math.abs(r), Math.abs(c)) !== 1;
            m.set(row + r, col + c, on ? 1 : 0);
          }
        }
      }
    }
  }

  function placeTiming(m) {
    for (var i = 8; i < m.size - 8; i++) {
      var v = i % 2 === 0 ? 1 : 0;
      if (m.free(6, i)) m.set(6, i, v);
      if (m.free(i, 6)) m.set(i, 6, v);
    }
  }

  function bchTypeInfo(data) {
    var d = data << 10;
    var digit = function (x) { var n = 0; while (x !== 0) { n++; x >>>= 1; } return n; };
    while (digit(d) - digit(0x537) >= 0) d ^= 0x537 << (digit(d) - digit(0x537));
    return ((data << 10) | d) ^ 0x5412;
  }

  function placeFormat(m, maskPattern) {
    // ECC level M = 0b00
    var bits = bchTypeInfo((0 << 3) | maskPattern);
    var i, mod;

    // copy 1 — around the top-left finder
    for (i = 0; i < 15; i++) {
      mod = (bits >> i) & 1;
      if (i < 6) m.set(i, 8, mod);
      else if (i < 8) m.set(i + 1, 8, mod);
      else m.set(m.size - 15 + i, 8, mod);
    }
    // copy 2 — split between bottom-left and top-right
    for (i = 0; i < 15; i++) {
      mod = (bits >> i) & 1;
      if (i < 8) m.set(8, m.size - i - 1, mod);
      else if (i < 9) m.set(8, 15 - i - 1 + 1, mod);
      else m.set(8, 15 - i - 1, mod);
    }
    m.set(m.size - 8, 8, 1); // the dark module
  }

  function bchTypeNumber(version) {
    var d = version << 12;
    var digit = function (x) { var n = 0; while (x !== 0) { n++; x >>>= 1; } return n; };
    while (digit(d) - digit(0x1f25) >= 0) d ^= 0x1f25 << (digit(d) - digit(0x1f25));
    return (version << 12) | d;
  }

  function placeVersion(m) {
    if (m.version < 7) return;
    var bits = bchTypeNumber(m.version);
    for (var i = 0; i < 18; i++) {
      var mod = (bits >> i) & 1;
      m.set(Math.floor(i / 3), m.size - 11 + (i % 3), mod);   // top-right block
      m.set(m.size - 11 + (i % 3), Math.floor(i / 3), mod);   // bottom-left block
    }
  }

  function placeData(m, codewords, maskPattern) {
    var maskFn = MASKS[maskPattern];
    var total = codewords.length * 8;
    var bitIndex = 0;
    var upward = true;
    for (var col = m.size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // the vertical timing column is not a data column
      for (var i = 0; i < m.size; i++) {
        var row = upward ? m.size - 1 - i : i;
        for (var c = 0; c < 2; c++) {
          var cc = col - c;
          if (!m.free(row, cc)) continue;
          var bit = 0;
          if (bitIndex < total) {
            bit = (codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1;
          }
          bitIndex++;
          if (maskFn(row, cc)) bit ^= 1;
          m.data[row][cc] = bit;
        }
      }
      upward = !upward;
    }
  }

  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
    function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
    function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; }
  ];

  function applyMask(m, pattern) {
    var fn = MASKS[pattern];
    for (var r = 0; r < m.size; r++) {
      for (var c = 0; c < m.size; c++) {
        if (m.reserved[r][c]) continue;
        if (fn(r, c)) m.data[r][c] ^= 1;
      }
    }
  }

  function penalty(m) {
    var score = 0;
    var n = m.size;
    var r, c, run, i;
    // rule 1: runs of 5+
    for (r = 0; r < n; r++) {
      run = 1;
      for (c = 1; c < n; c++) {
        if (m.data[r][c] === m.data[r][c - 1]) { run++; }
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }
    for (c = 0; c < n; c++) {
      run = 1;
      for (r = 1; r < n; r++) {
        if (m.data[r][c] === m.data[r - 1][c]) { run++; }
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }
    // rule 2: 2x2 blocks
    for (r = 0; r < n - 1; r++) {
      for (c = 0; c < n - 1; c++) {
        var v = m.data[r][c];
        if (v === m.data[r][c + 1] && v === m.data[r + 1][c] && v === m.data[r + 1][c + 1]) score += 3;
      }
    }
    // rule 3: finder-like patterns
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    var pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (r = 0; r < n; r++) {
      for (c = 0; c <= n - 11; c++) {
        var ok1 = true, ok2 = true;
        for (i = 0; i < 11; i++) {
          if (m.data[r][c + i] !== pat1[i]) ok1 = false;
          if (m.data[r][c + i] !== pat2[i]) ok2 = false;
        }
        if (ok1) score += 40;
        if (ok2) score += 40;
      }
    }
    for (c = 0; c < n; c++) {
      for (r = 0; r <= n - 11; r++) {
        var ok3 = true, ok4 = true;
        for (i = 0; i < 11; i++) {
          if (m.data[r + i][c] !== pat1[i]) ok3 = false;
          if (m.data[r + i][c] !== pat2[i]) ok4 = false;
        }
        if (ok3) score += 40;
        if (ok4) score += 40;
      }
    }
    // rule 4: dark ratio
    var dark = 0;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) dark += m.data[r][c];
    var ratio = dark / (n * n);
    score += Math.floor(Math.abs(ratio - 0.5) * 20) * 10;
    return score;
  }

  function encode(text, opts) {
    opts = opts || {};
    var bytes = utf8Bytes(String(text));
    var version = opts.version || pickVersion(bytes.length);
    var codewords = buildCodewords(bytes, version);

    var best = null;
    var maskList = opts.mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [opts.mask];
    for (var mi = 0; mi < maskList.length; mi++) {
      var mask = maskList[mi];
      var m = new Matrix(version);
      placeFinder(m, 0, 0);
      placeFinder(m, m.size - 7, 0);
      placeFinder(m, 0, m.size - 7);
      placeAlignment(m, version);
      placeTiming(m);
      placeVersion(m);
      placeFormat(m, mask);      // reserved first, so the zigzag skips it
      placeData(m, codewords, mask);
      var score = penalty(m);
      if (!best || score < best.score) best = { score: score, matrix: m, mask: mask };
    }
    return { size: best.matrix.size, modules: best.matrix.data, version: version, mask: best.mask };
  }

  function renderToCanvas(canvas, qr, opts) {
    opts = opts || {};
    var margin = opts.margin === undefined ? 4 : opts.margin;
    var dark = opts.dark || '#0b120d';
    var light = opts.light || '#ffffff';
    var total = qr.size + margin * 2;
    var scale = opts.scale || Math.max(1, Math.floor((opts.size || 280) / total));
    var px = total * scale;
    canvas.width = px;
    canvas.height = px;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = dark;
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) {
          ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
        }
      }
    }
    return px;
  }

  /** UPI payment URI + the apps that can open it. */
  function upiUri(opts) {
    var params = [
      'pa=' + encodeURIComponent(opts.pa || ''),
      'pn=' + encodeURIComponent(opts.pn || 'GymFlow'),
      'am=' + encodeURIComponent(opts.am || '0.00'),
      'cu=' + (opts.cu || 'INR'),
      'tn=' + encodeURIComponent(opts.tn || 'GymFlow payment')
    ];
    if (opts.tr) params.push('tr=' + encodeURIComponent(opts.tr));
    if (opts.mc) params.push('mc=' + encodeURIComponent(opts.mc));
    return 'upi://pay?' + params.join('&');
  }

  global.QR = { encode: encode, renderToCanvas: renderToCanvas, upiUri: upiUri, _internals: { buildCodewords: buildCodewords, pickVersion: pickVersion, dataCapacity: dataCapacity, rsEncode: rsEncode, utf8Bytes: utf8Bytes } };
})(typeof window !== 'undefined' ? window : globalThis);
