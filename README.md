# Fire Zone — Free Fire–style Battle Royale (Android)

A complete 3D battle-royale shooter in the spirit of Free Fire, built as a
self-contained Android game. **20 players parachute onto an island, loot
weapons, and fight until the shrinking zone forces one final BOOYAH.**

No game engine license needed — the game is pure WebGL (Three.js) running
fullscreen in a hardware-accelerated WebView, packaged by a tiny native
Android shell.

## Gameplay

- **20-player match**: you + 19 AI enemies (Free Fire bots style)
- **Parachute drop**: steer your landing anywhere on the island
- **Loot**: 4 weapons — M500 Pistol, MP40 SMG, AK47 Rifle, M1014 Shotgun
- **Shrinking safe zone** with escalating damage phases (like Free Fire/PUBG)
- **Kill feed, minimap, hit markers, sprint, jump, medkits**
- AI enemies: wander → engage → flank/strafe → rush the zone, plus off-screen
  skirmishes that shrink the lobby realistically
- Last one standing wins the **BOOYAH!**

## Controls

| Mobile | Desktop |
| --- | --- |
| Left stick — move | WASD — move |
| Drag right side — aim | Mouse — aim (click to lock) |
| FIRE / RELOAD / SWAP / JUMP buttons | LMB — fire, R — reload, Q — swap |
| Med button — heal | H — medkit, Shift — sprint, P — pause |

## Project layout

```
app/src/main/assets/game/     The whole game (Three.js + game.js + index.html)
app/src/main/java/.../        120-line WebView shell (fullscreen + haptics bridge)
app/src/main/res/             Launcher icons
.github/workflows/build-apk.yml   CI: builds the APK on every push
tools/smoke-test.js           Headless test harness (runs the real game loop in Node)
```

## Build the APK

### Locally
```bash
./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk
```
Requirements: JDK 17, Android SDK 34 (`local.properties` with `sdk.dir` if needed).

### CI (automatic)
Every push runs `.github/workflows/build-apk.yml`:
1. Headless game-logic smoke test
2. `assembleDebug` + `assembleRelease`
3. APKs attached as workflow artifacts — download from the **Actions** tab → run → *Artifacts*
4. `v*` tags additionally publish a GitHub Release with both APKs

The release APK falls back to the debug signature when no CI keystore secret is
configured, so it is always installable. To sign properly, add repo secrets
`RELEASE_STORE_FILE` (base64 keystore path handling in `app/build.gradle`),
`RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`.

## Install on a phone

```bash
adb install app/build/outputs/apk/release/app-release.apk
```
or copy the APK to the phone and open it (allow "install unknown apps").

## Run in a desktop browser (quick dev loop)

Serve `app/src/main/assets/game/` with any static server and open it —
desktop controls (WASD + mouse) work automatically.
