#!/usr/bin/env python3
"""Minimal `zipalign` replacement.

Android refuses to install APKs targeting API 30+ whose `resources.arsc` is not
stored uncompressed on a 4-byte boundary, and Play/Android prefer every stored
entry to be aligned. The Android SDK's zipalign binary is not available in this
build environment, so we do the same job with the stdlib:

  * stored (uncompressed) entries get an alignment extra field (ID 0xD935)
  * 4-byte alignment for everything, 4096 for .so files
  * compressed entries are copied untouched
  * entry order, metadata and CRCs are preserved

    python3 scripts/zipalign.py in.apk out.apk [--align 4]
"""
from __future__ import annotations

import struct
import sys
import zipfile
from pathlib import Path

ALIGN_EXTRA_ID = 0xD935


def pad_for(offset: int, filename_len: int, align: int) -> int:
    """Extra-field padding needed so that the entry DATA starts aligned."""
    # local header (30) + name + extra-field header (4) + align u16 (2)
    base = offset + 30 + filename_len + 6
    return (-base) % align


def realign(src: Path, dst: Path, align: int = 4, verbose: bool = False) -> dict:
    stats = {"stored": 0, "padded": 0, "compressed": 0}
    with zipfile.ZipFile(src) as zin, open(dst, "wb") as raw:
        zout = zipfile.ZipFile(raw, "w")
        for info in zin.infolist():
            data = zin.read(info.filename)
            new = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            new.compress_type = info.compress_type
            new.external_attr = info.external_attr
            new.internal_attr = info.internal_attr
            new.create_system = info.create_system
            new.comment = info.comment

            if info.compress_type == zipfile.ZIP_STORED:
                stats["stored"] += 1
                this_align = 4096 if info.filename.endswith(".so") else align
                offset = raw.tell()
                pad = pad_for(offset, len(info.filename.encode("utf-8")), this_align)
                if pad:
                    stats["padded"] += 1
                # extra field: id, size(=2+pad), alignment(u16), padding bytes
                new.extra = struct.pack("<HHH", ALIGN_EXTRA_ID, 2 + pad, this_align) + b"\x00" * pad
                if verbose:
                    print(f"  stored {info.filename:<44} align={this_align:<5} pad={pad}")
            else:
                stats["compressed"] += 1
            zout.writestr(new, data)
        zout.close()
    return stats


def verify(path: Path, align: int = 4) -> list[str]:
    problems = []
    with open(path, "rb") as fh, zipfile.ZipFile(path) as zf:
        for info in zf.infolist():
            if info.compress_type != zipfile.ZIP_STORED:
                continue
            fh.seek(info.header_offset)
            header = fh.read(30)
            name_len, extra_len = struct.unpack("<HH", header[26:30])
            data_offset = info.header_offset + 30 + name_len + extra_len
            need = 4096 if info.filename.endswith(".so") else align
            if data_offset % need:
                problems.append(f"{info.filename} not aligned ({data_offset % need} mod {need})")
    return problems


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        return 2
    align = 4
    for a in sys.argv[1:]:
        if a.startswith("--align"):
            align = int(a.split("=")[1]) if "=" in a else 4
    src, dst = Path(args[0]), Path(args[1])
    stats = realign(src, dst, align=align, verbose="--verbose" in sys.argv)
    problems = verify(dst, align=align)
    print(f"zipalign: {stats['stored']} stored ({stats['padded']} padded), {stats['compressed']} compressed")
    if problems:
        print("ALIGNMENT PROBLEMS:")
        for p in problems:
            print("  -", p)
        return 1
    print("zipalign: all stored entries aligned ✓")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
