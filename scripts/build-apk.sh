#!/usr/bin/env bash
# Build a signed, aligned, release GymFlow APK.
#
#   bash scripts/build-apk.sh
#   GYMFLOW_API_BASE=https://gym.example.com bash scripts/build-apk.sh
#
# Toolchain (all resolved automatically, see scripts/setup-toolchain.sh):
#   JAVA_HOME   -> needs `java` + `keytool`   (JDK 17+)
#   APKTOOL_JAR -> apktool 2.x jar (aapt2 + smali assembler inside)
#   APKSIGNER_JAR -> apksigner jar
#   PYTHON      -> with Pillow (icons) — any python3 works for zipalign
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="GymFlow"
VERSION="1.0.0"
OUT_DIR="$ROOT/release"
KEYSTORE_DIR="$ROOT/release/keystore"
KEYSTORE="$KEYSTORE_DIR/gymflow-release.jks"
KEY_ALIAS="gymflow"
: "${KEYSTORE_PASS:=gymflow-release-pass}"
: "${PYTHON:=python3}"

JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}"
JAVA="${JAVA_BIN}java"
KEYTOOL="${JAVA_BIN}keytool"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing tool: $1"; exit 1; }; }

echo "==> 1/6 checking toolchain"
need "$JAVA"
need "$KEYTOOL"
[ -f "${APKTOOL_JAR:?set APKTOOL_JAR to the apktool jar}" ] || { echo "APKTOOL_JAR not found: $APKTOOL_JAR"; exit 1; }
[ -f "${APKSIGNER_JAR:?set APKSIGNER_JAR to the apksigner jar}" ] || { echo "APKSIGNER_JAR not found: $APKSIGNER_JAR"; exit 1; }
"$JAVA" -version 2>&1 | head -1

echo "==> 2/6 launcher icons"
"$PYTHON" scripts/make-icons.py >/dev/null
echo "    icons ok"

echo "==> 3/6 syncing web app into android/assets/www"
node scripts/sync-webapp.mjs

echo "==> 4/6 building resources + dex (apktool)"
mkdir -p "$OUT_DIR"
"$JAVA" -jar "$APKTOOL_JAR" b android -o "$OUT_DIR/${APP_NAME}-unaligned.apk" --use-aapt2 1 \
  | sed 's/^/    /'

echo "==> 5/6 zipalign"
"$PYTHON" scripts/zipalign.py "$OUT_DIR/${APP_NAME}-unaligned.apk" "$OUT_DIR/${APP_NAME}-aligned.apk"

echo "==> 6/6 signing"
mkdir -p "$KEYSTORE_DIR"
if [ ! -f "$KEYSTORE" ]; then
  echo "    creating release keystore at $KEYSTORE"
  "$KEYTOOL" -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass "$KEYSTORE_PASS" -keypass "$KEYSTORE_PASS" \
    -dname "CN=GymFlow, OU=Mobile, O=GymFlow, L=Kolkata, S=West Bengal, C=IN" >/dev/null
fi

APK="$OUT_DIR/${APP_NAME}-${VERSION}.apk"
"$JAVA" -jar "$APKSIGNER_JAR" sign \
  --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEYSTORE_PASS" --key-pass "pass:$KEYSTORE_PASS" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --min-sdk-version 21 --max-sdk-version 34 \
  --out "$APK" "$OUT_DIR/${APP_NAME}-aligned.apk" | sed 's/^/    /'

"$JAVA" -jar "$APKSIGNER_JAR" verify --print-certs "$APK" 2>/dev/null | sed 's/^/    /' | head -6

rm -f "$OUT_DIR/${APP_NAME}-unaligned.apk" "$OUT_DIR/${APP_NAME}-aligned.apk"

SIZE=$(du -h "$APK" | cut -f1)
echo
echo "✅ built $APK ($SIZE)"
echo "   install: adb install -r \"$APK\""
echo "   keep $KEYSTORE + its password safe — future updates must be signed with it"
