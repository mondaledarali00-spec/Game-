# Building the GymFlow APK

`scripts/build-apk.sh` does everything: icons → bundled web assets → resources +
dex → zipalign → signing. Nothing in the build path needs Gradle or the Android
SDK; it needs a JDK plus two jars.

## Why not Gradle?

This project is deliberately buildable without the SDK: the native shell is 3
classes, resources are 5 PNGs + 2 XML files. `apktool` (which embeds `aapt2` and
the smali assembler) turns `android/` into an APK, then `apksigner` signs it.

If you *want* Gradle later, copy `android/src-java/**` into a normal
`app/src/main/java/` project with the same manifest/resources — it is plain
Android Java with no dependencies.

## 1. Toolchain

| Tool | Purpose | How to get it |
|---|---|---|
| JDK 17+ (`java`, `keytool`) | runs the jars, makes the keystore | `apt install openjdk-17-jdk` / Temurin |
| `apktool.jar` 2.9+ | aapt2 link + smali → dex + zip | <https://github.com/iBotPeaches/Apktool/releases> or `apktool` in Termux |
| `apksigner.jar` | v1+v2+v3 signing | inside Android build-tools, or the jar shipped with `apktool` wrappers |
| `python3` + `Pillow` | icons; stdlib-only for zipalign | `pip install pillow` |

`scripts/setup-toolchain.sh` fetches the jars into `toolchain/` and prints the
`export` lines to use.

## 2. Build

```bash
export JAVA_HOME=/path/to/jdk
export APKTOOL_JAR=/path/to/apktool.jar
export APKSIGNER_JAR=/path/to/apksigner.jar
export PYTHON=python3

bash scripts/build-apk.sh
```

Optional:

```bash
GYMFLOW_API_BASE=https://gym.example.com bash scripts/build-apk.sh   # bake backend URL
KEYSTORE_PASS='something-long' bash scripts/build-apk.sh             # keystore password
```

Output: `release/GymFlow-<version>.apk`, aligned and signed, with the certificate
fingerprints printed at the end.

## 3. Signing key

The first build creates `release/keystore/gymflow-release.jks`
(alias `gymflow`, RSA 2048, 30 years, password from `KEYSTORE_PASS`,
default `gymflow-release-pass`).

**Back it up.** Android only lets an update install over an existing app when it is
signed with the same key. Lose the keystore and every user must uninstall first.
The keystore is git-ignored on purpose; store it in a password manager.

For Play Store uploads, use Play App Signing: register the same package
`com.gymflow.app`, switch the upload key, and keep `versionCode` increasing.

## 4. Releasing an update

1. Bump `android/AndroidManifest.xml` → `android:versionCode` (+1) and `versionName`.
2. Bump `webapp/js/config.js` → `version`.
3. Rebuild; the output name uses the version in `scripts/build-apk.sh` (`VERSION=`).
4. Users install over the old app (same key, higher versionCode).

## 5. What is inside the APK

```
classes.dex                      MainActivity, AppWebViewClient, Bridge
resources.arsc + res/mipmap-*    theme colours, strings, launcher icons
assets/www/**                    the entire offline app (HTML/CSS/JS)
AndroidManifest.xml              minSdk 21, targetSdk 34, INTERNET + VIBRATE
```

`assets/www` is served by `AppWebViewClient.shouldInterceptRequest()` over
`https://appassets.androidplatform.net/assets/www/` — a real secure origin, so
`localStorage` (accounts, workouts, Pro entitlement) behaves exactly like a
website. If interception fails on an ancient WebView, the client falls back to
`file:///android_asset/www/index.html`.

## 6. Checking a build

```bash
unzip -l release/GymFlow-1.0.0.apk
$JAVA_HOME/bin/java -jar "$APKSIGNER_JAR" verify --print-certs release/GymFlow-1.0.0.apk
python3 scripts/zipalign.py release/GymFlow-1.0.0.apk /tmp/check.apk   # alignment
$JAVA_HOME/bin/java -jar "$APKTOOL_JAR" d release/GymFlow-1.0.0.apk -o /tmp/decoded   # round-trip
```

## 7. Common problems

| Problem | Fix |
|---|---|
| `error: resource mipmap/ic_launcher not found` | run `python3 scripts/make-icons.py` first |
| `INSTALL_FAILED_OLDER_SDK` | device is below Android 5.0 — raise nothing, it is minSdk 21 |
| `INSTALL_PARSE_FAILED_NO_CERTIFICATES` | signing step failed; check `APKSIGNER_JAR` and the keystore password |
| `App not installed` after an update | different signing key — uninstall the old build once |
| White screen on launch | check `assets/www/index.html` exists (run `node scripts/sync-webapp.mjs`), and that the WebView is not disabled by the OEM |
