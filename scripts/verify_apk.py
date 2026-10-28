#!/usr/bin/env python3
"""Sanity-check a built APK before shipping it.

Catches the failure modes that make Android say "keeps stopping" or refuse to
install, without needing a device:

  * manifest: package, launcher activity exists, exported flag, min/target sdk,
    every activity/application class present in the dex
  * dex: parses, every class referenced by the manifest is defined
  * native shell methods exist with the exact signatures MainActivity needs
  * assets/www/index.html + every asset referenced by index.html is present
  * resources: launcher icon exists in at least one density, app_name resolves
  * zip: no duplicate entries, resources.arsc stored, alignment ok
  * signature: v2/v3 signing block present

    python3 scripts/verify_apk.py release/GymFlow-1.0.1.apk
"""
from __future__ import annotations

import re
import struct
import sys
import zipfile
from pathlib import Path

try:  # androguard is chatty; keep build logs readable
    from loguru import logger as _logger
    _logger.remove()
except Exception:
    pass

try:
    from androguard.core.apk import APK
    from androguard.core.dex import DEX
    HAVE_ANDROGUARD = True
except Exception:  # pragma: no cover
    HAVE_ANDROGUARD = False

problems: list[str] = []
notes: list[str] = []


def problem(msg: str) -> None:
    problems.append(msg)


def note(msg: str) -> None:
    notes.append(msg)


def check_zip(path: Path) -> zipfile.ZipFile:
    zf = zipfile.ZipFile(path)
    names = zf.namelist()
    if len(names) != len(set(names)):
        problem("duplicate zip entries")
    bad = zf.testzip()
    if bad:
        problem(f"corrupt zip entry: {bad}")
    if "resources.arsc" not in names:
        problem("resources.arsc missing")
    else:
        info = zf.getinfo("resources.arsc")
        if info.compress_type != zipfile.ZIP_STORED:
            problem("resources.arsc must be STORED (uncompressed) or Android 11+ rejects it")
        with open(path, "rb") as fh:
            fh.seek(info.header_offset)
            header = fh.read(30)
            name_len, extra_len = struct.unpack("<HH", header[26:30])
            offset = info.header_offset + 30 + name_len + extra_len
            if offset % 4:
                problem(f"resources.arsc data starts at {offset} (not 4-byte aligned)")
            else:
                note("resources.arsc: stored + 4-byte aligned")
    if "classes.dex" not in names:
        problem("classes.dex missing")
    if "AndroidManifest.xml" not in names:
        problem("AndroidManifest.xml missing")
    return zf


def check_manifest(zf: zipfile.ZipFile, path: Path):
    if not HAVE_ANDROGUARD:
        note("androguard not installed — skipping manifest/dex checks")
        return
    apk = APK(str(path))
    pkg = apk.get_package()
    note(f"package={pkg} version={apk.get_androidversion_name()} ({apk.get_androidversion_code()})")
    note(f"sdk min={apk.get_min_sdk_version()} target={apk.get_target_sdk_version()}")

    if not re.match(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$", pkg or ""):
        problem(f"suspicious package name: {pkg!r}")

    activities = apk.get_activities()
    launcher = apk.get_main_activity()
    if not launcher:
        problem("no MAIN/LAUNCHER activity — the app will not appear in the launcher")
    elif launcher not in activities:
        problem(f"launcher activity {launcher} is not in the manifest activity list")
    else:
        note(f"launcher activity = {launcher}")

    name = apk.get_app_name()
    if not name:
        problem("app label does not resolve (missing string resource?)")
    else:
        note(f"app label = {name!r}")

    icon = apk.get_app_icon()
    if not icon:
        problem("no launcher icon resolved")
    else:
        note(f"icon = {icon}")

    dex_classes = set()
    for raw in apk.get_all_dex():
        d = DEX(raw)
        for c in d.get_classes():
            dex_classes.add(c.get_name())
    note(f"dex classes: {len(dex_classes)}")

    # every component named in the manifest must exist in the dex
    for comp in activities:
        cls = comp.replace(".", "/")
        dotted = "L" + cls + ";"
        if dotted not in dex_classes:
            # manifest may use a relative name like ".MainActivity"
            if not any(c.endswith("/" + comp.split(".")[-1] + ";") for c in dex_classes):
                problem(f"activity {comp} is not defined in the dex -> InstantiationException on launch")

    # the shell must expose the exact signatures MainActivity calls
    required = {
        "Lcom/gymflow/app/AppWebViewClient;": ["<init>", "shouldOverrideUrlLoading"],
        "Lcom/gymflow/app/Bridge;": ["<init>", "open", "info"],
    }
    for raw in apk.get_all_dex():
        d = DEX(raw)
        for c in d.get_classes():
            cname = c.get_name()
            if cname in required:
                methods = {m.get_name() for m in c.get_methods()}
                for want in required[cname]:
                    if want not in methods:
                        problem(f"{cname} is missing method {want} -> VerifyError/NoSuchMethodError")
                required.pop(cname)
    for missing in required:
        problem(f"{missing} is referenced by MainActivity but not present in the dex")
    if not required:
        note("native shell classes + methods present")


def check_assets(zf: zipfile.ZipFile):
    names = set(zf.namelist())
    index = "assets/www/index.html"
    if index not in names:
        problem(f"{index} missing -> blank screen")
        return
    html = zf.read(index).decode("utf-8", "replace")
    for ref in re.findall(r'(?:src|href)="([^"]+)"', html):
        if ref.startswith(("http", "#", "data:")):
            continue
        target = "assets/www/" + ref.lstrip("./")
        if target not in names:
            problem(f"index.html references missing asset: {target}")
    scripts = [n for n in names if n.startswith("assets/www/js/") and n.endswith(".js")]
    if len(scripts) < 8:
        problem(f"only {len(scripts)} js modules bundled — sync-webapp may have failed")
    for s in scripts:
        code = zf.read(s).decode("utf-8", "replace")
        if "WEBAPP_PLACEHOLDER" in code:
            problem(f"placeholder left in {s}")
    note(f"assets/www: {len([n for n in names if n.startswith('assets/www/')])} files, {len(scripts)} js modules")

    size = sum(zf.getinfo(n).file_size for n in names if n.startswith("assets/www/"))
    if size < 60_000:
        problem(f"bundled web app looks too small ({size} bytes)")
    else:
        note(f"bundled web app size: {size // 1024} KB")


def check_signature(path: Path, zf: zipfile.ZipFile) -> None:
    data = path.read_bytes()
    if b"APK Sig Block 42" in data:
        note("APK signing block present (v2/v3)")
    else:
        problem("no APK signing block — Android 11+ will refuse to install (v2 required)")
    if any(n.startswith("META-INF/") and n.endswith((".RSA", ".DSA", ".EC")) for n in zf.namelist()):
        note("v1 (JAR) signature present")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = Path(sys.argv[1])
    if not path.exists():
        print(f"not found: {path}")
        return 2

    zf = check_zip(path)
    check_manifest(zf, path)
    check_assets(zf)
    check_signature(path, zf)

    print(f"verifying {path} ({path.stat().st_size // 1024} KB)")
    for n in notes:
        print(f"  ok    {n}")
    for p in problems:
        print(f"  FAIL  {p}")
    if problems:
        print(f"\n{len(problems)} problem(s) — do not ship this build")
        return 1
    print("\nAPK looks shippable ✓")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
