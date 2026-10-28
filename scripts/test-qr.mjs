#!/usr/bin/env node
/* Generate QR codes with webapp/js/qr.js and check them against a reference
   encoder (the Python `qrcode` package) — byte-for-byte where possible.

   node scripts/test-qr.mjs            # writes /tmp/gymflow-qr/*.pbm + .txt
   python3 -c "import qrcode"          # needed for the comparison half
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'webapp/js/qr.js'), 'utf8');
const sandbox = {};
new Function('window', src)(sandbox);
const QR = sandbox.QR;

const OUT = process.argv[2] || '/tmp/gymflow-qr';
fs.mkdirSync(OUT, { recursive: true });

const samples = [
  'HELLO WORLD 123',
  'upi://pay?pa=8089274532@axl&pn=GymFlow&am=149.00&cu=INR&tn=GymFlow%20Pro&tr=GYMPRO123',
  'upi://pay?pa=8089274532@axl&pn=GymFlow&am=79.00&cu=INR&tn=GymFlow%20Pro%20-%201%20Year%20GYMPROXYZ&tr=GYMPROXYZ&mc=7994'
];
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&?=:/.-_@%+ ';
for (const len of [40, 100, 200, 300, 400]) {
  let s = '';
  for (let i = 0; i < len; i++) s += chars[(i * 31 + len * 7) % chars.length];
  samples.push(s);
}

const meta = [];
samples.forEach((text, i) => {
  const qr = QR.encode(text);
  const t = qr.size;
  let pbm = `P1\n${t} ${t}\n`;
  for (let r = 0; r < t; r++) {
    let row = '';
    for (let c = 0; c < t; c++) row += (qr.modules[r][c] ? '1 ' : '0 ');
    pbm += row + '\n';
  }
  fs.writeFileSync(path.join(OUT, `qr${i}.pbm`), pbm);
  fs.writeFileSync(path.join(OUT, `qr${i}.txt`), text);
  meta.push(`${qr.version},${qr.mask}`);
  console.log(`qr${i}: v${qr.version} mask=${qr.mask} size=${qr.size} bytes=${Buffer.byteLength(text)}`);
});
fs.writeFileSync(path.join(OUT, 'meta.txt'), meta.join('\n'));
console.log(`\nwrote ${samples.length} codes to ${OUT}`);
console.log('verify with the reference encoder:');
console.log(`  python3 scripts/test-qr-verify.py ${OUT}`);
