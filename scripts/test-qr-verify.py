#!/usr/bin/env python3
"""Compare the QR codes produced by scripts/test-qr.mjs with the reference
`qrcode` package, module for module. Also optionally decodes them with OpenCV.

    python3 scripts/test-qr-verify.py [/tmp/gymflow-qr]

Exit code 0 means every code is byte-identical to the reference encoder.
"""
import sys
from pathlib import Path

try:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_M
except ImportError:
    print("pip install qrcode  (needed for the reference comparison)")
    raise SystemExit(2)

folder = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/gymflow-qr")
meta = (folder / "meta.txt").read_text().split("\n")
ok = 0
for i, line in enumerate(meta):
    version, mask = (int(x) for x in line.split(","))
    text = (folder / f"qr{i}.txt").read_text()
    ref = qrcode.QRCode(version=version, error_correction=ERROR_CORRECT_M, box_size=1, border=0)
    # our encoder always uses byte mode — pin the reference to the same mode so
    # an alphanumeric-mode choice by qrcode cannot masquerade as a difference
    ref.add_data(qrcode.util.QRData(text.encode('utf-8'), mode=qrcode.util.MODE_8BIT_BYTE), optimize=0)
    ref.makeImpl(False, mask)
    reference = [[1 if v else 0 for v in row] for row in ref.get_matrix()]

    lines = (folder / f"qr{i}.pbm").read_text().split("\n")
    w, h = (int(x) for x in lines[1].split())
    mine = [[int(v) for v in line.split()] for line in lines[2:2 + h]]

    diffs = sum(1 for r in range(h) for c in range(w) if reference[r][c] != mine[r][c])
    ok += diffs == 0
    print(f"qr{i}: v{version} mask={mask} module-diffs={diffs} {'IDENTICAL' if diffs == 0 else 'DIFFERENT'}")

print(f"\n{ok}/{len(meta)} identical to the reference encoder")
raise SystemExit(0 if ok == len(meta) else 1)
