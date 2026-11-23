# Towfik Youtube — Liquid Glass Blue (built from source)

**Build:** 2026-11-23 (revision 5) · **Output:** `Towfik-Youtube-4.0.0-LiquidGlass-Everywhere-v5.apk` (8,693,827 bytes)
**SHA-256:** `bdc6fbe46d8bd9954864c99760cebab7f3a82541f270e8a31eb691e963058d32`
**Supersedes:** revisions 4, 3, 2 and 1 — all signed with the same key, so they install over each other.
**Source used:** `Towfik Youtube Source.zip` (57,066,208 bytes · SHA-256 `4ba42f67…654d`) = **Litube 4.0.0 Gradle project**, 979 Kotlin files.

---

## Revision 5 — the watch page was black in light mode (fixed)

**Your report:** the home screen is fine now, but on the video page everything below the player is black even
though the app is set to the white/light theme.

**Cause (again mine, from revision 3).** The watch page lives in `WatchActivity`, which is a `PlaybackActivity`
and is deliberately skipped by the window-background logic — the player hands the backing surface between the
page and fullscreen itself. It does that by calling `applyWatchWindowBackground(DesignTokens.Background)`.
In revision 3 `DesignTokens.Background` became **transparent**, so the activity was setting a *transparent*
window background, and a transparent window shows as **black** in light mode. Everything you saw follows from
that: the page is black, the glass pills (`#8CFFFFFF` over black) render mid-grey, and the empty area under the
comments is the same grey.

**Fix — two parts, so the page is right even mid-transition:**

1. `WatchActivity` now sets an **opaque** window backing again: the frosted wallpaper drawable when the page is
   showing, black only while the player owns the screen (fullscreen / PiP). This also covers the frame or two
   Android exposes during a fullscreen resize.
2. `WatchScreen` draws the same backdrop itself via a new `Modifier.glassWallpaper()` (Compose twin of the
   window drawable, identical layers and numbers), replacing the now-transparent fills. That keeps the page
   consistent during the page ⇄ fullscreen morph.

Result: in light mode the watch page is the same frosted backdrop as the rest of the app, with white glass
pills and cards; in dark mode it stays midnight. Fullscreen playback is still black, as it should be.

**Verified:** `BUILD SUCCESSFUL in 10m 15s`, zero Kotlin errors; `apksigner` v2 + v3 true, same certificate;
`classes.dex` differs from revision 4. One compile error was hit and fixed on the way (a third
`applyWatchWindowBackground(...)` call site in `onCreate`).

---

## Revision 4 — the blank home screen behind the mini player (fixed)

**Your report:** play a video, press back, the mini player appears — and the home screen behind it is empty,
nothing but the pale blue backdrop.

**Cause (my bug in revision 3, not something you did).** The mini player is not part of the home screen: it is a
separate `MATCH_PARENT` `ComposeView` overlay that `ContentActivity` stacks on top of the content view, and that
overlay composes `AppTheme { … }` like every other screen. In revision 3 I put the wallpaper *inside* `AppTheme`,
so the overlay drew its own full-screen opaque backdrop on top of the home screen — leaving only the mini video
visible. The screenshot matches exactly: full-screen backdrop + mini video, no bars, no chips, no feed.

**Fix.** The backdrop moved out of Compose and became the **window background** (`GlassWallpaperDrawable`, set in
`NativeActivity.applyWindowBackground`). It is drawn once, behind every view in the window, so overlays stay
genuinely transparent and cannot paint over the screen behind them. `AppTheme` no longer draws a backdrop at all.
The drawable is cached per appearance and rebuilt only when the window is resized.

This is also the correct architecture for the rest of the glass work: any future full-screen overlay inherits the
backdrop for free instead of duplicating it.

**Verified:** rebuilt clean — `BUILD SUCCESSFUL in 8m 49s`, zero Kotlin errors; `apksigner` v2 + v3 true, same
certificate; `classes.dex` differs from revision 3 (the fix is really in the APK).

**Still not device-tested by me** — the cause is unambiguous in the code and the symptom disappears with the
overlay no longer drawing a backdrop, but please confirm: play → back → home should now show the feed with the
mini player floating over it.

---

## Revision 3 — the reference style, on every screen

You sent the "Liquid Glass UI Adoption" reference and asked for that style everywhere plus the search bar in the
right corner. That look is not one component, it is three things working together, so this revision changes the
foundation rather than one screen.

### 1. A backdrop for the glass to sit on — `ui/design/GlassWallpaper.kt` (new; window background since revision 4)

The reference's glass is convincing because there is a heavily out-of-focus photo behind it. We do not ship a
bitmap: `GlassWallpaper` builds the same read from layered gradients — milky highlight top-left, cool blue body,
a bloom bottom-right and one diagonal "window light" streak. It is drawn once by `AppTheme`, so **every screen
composed through the theme gets it**: all 16 activities that call `setAppContent` and all 13 screens that call
`AppTheme` directly.

Because the backdrop is low-frequency by construction, translucent panels over it stay readable — no text
ghosting, no legibility loss.

### 2. Screens stop painting a flat colour — translucent by default

`AppPalette.background` and the Material3 `background` role are now **transparent**, so the wallpaper shows
through every screen instead of being covered by `#EEF4FC` / `#070E1A`. Surfaces became real glass:

| Token | Light (was → now) | Dark (was → now) |
|---|---|---|
| screen background | `#EEF4FC` → **transparent** | `#070E1A` → **transparent** |
| inset surface (chips/rows) | `#E9F1FB` → **`#8CFFFFFF`** (55 % white) | `#13233A` → **`#3DFFFFFF`** |
| ghost / pressed | `#DCE8F7` → **`#B8FFFFFF`** | `#1B2E48` → **`#5CFFFFFF`** |
| hairline border | `#330A84FF` → **`#99FFFFFF`** | `#336FB4FF` → **`#29FFFFFF`** |
| panels/sheets (M3 `surface`) | `#FDFEFF` → **`#E6FFFFFF`** | `#0B1626` → **`#E60B1626`** |

Radius scale went up across the board (8/12/16/20/26 dp, sheets 28 dp, menus 20 dp) because glass reads through
its corners. `LiquidGlass.fill()`/`fillStrong()`/`hairline()`/`highlight()` were retuned to the reference's
milky-white-on-light / cool-navy-on-dark values.

**One correction this forced:** ~14 places used `DesignTokens.Background` as a *foreground* colour (text and icons
drawn on an ink or accent fill). With the background transparent those would have become invisible, so a new
`DesignTokens.Contrast` token (white in light, `#06121F` in dark) replaced them, and bars/sheets that used
`Background` as a panel colour now use `DesignTokens.Panel`.

### 3. Chrome rebuilt as floating glass

- Home top bar, chip row, dock: unchanged layout, new glass values, sheen kept (7.2 s / 5.2 s / 9.6 s).
- **Search is now a glass pill in the right corner** of the top bar (magnifier + "Search"), instead of a bare
  icon button — brand left, pill right, `weight(1f)` spacer between them.
- `BrowseNavigationBar` (Search, Channel, Watch…) and `MainNavigationBar` (You, Subscriptions…) were flat strips
  with a 1 dp divider; both are now the same floating 26 dp glass dock as Home, with the same slow sheen.
- `AppTopAppBar` (Settings, Advanced, About, Downloads) defaulted to the flat background colour; it now uses the
  translucent glass surface.
- Dialogs and bottom sheets inherit the glass `surface` role, so they arrive frosted without per-screen edits.

### What this is NOT — read this before you judge it

- **There is no live backdrop blur of scrolling content.** Jetpack Compose cannot sample what is drawn behind a
  node, so when a card scrolls under the floating top bar you see it through translucent glass, not through a
  blurred copy of it. The reference image has a blurred *photo* behind its cards — that is the part I reproduced
  (as a designed backdrop). Real live blur is possible only by adding a third-party library (Haze) that captures
  the tree into a layer; that is a new dependency and a much riskier change, and I did not take it without asking.
  Say the word and I will do it as revision 4.
- **Still not device-tested.** Compile-, signature- and resource-verified only. The specific risks for this
  round are listed below.

### Verification of this build

- ✅ `:app:assembleRelease` → **BUILD SUCCESSFUL in 9m 40s** (R8 + resource shrinking); zero Kotlin errors
- ✅ `apksigner verify` → v2 true, v3 true; same certificate (`07:34:A1:93:…:CD:3F`)
- ✅ `classes.dex` grew by 5,116 bytes and differs from revision 2 — the new code is really in the APK
- ✅ `aapt2 dump badging` → `com.hhst.litube` 4.0.0 (400), minSdk 24, targetSdk 36

### Cosmetic risks to check first, in order

1. **Contrast in dark mode** — inset surfaces are now `#3DFFFFFF`; if rows look washed out, raise to `#4D`.
2. **App bars on Settings/Channel/Search** now look frosted; if text scrolling under them is distracting, the
   one-line fix is to raise `surface` alpha to `#F2`.
3. **Empty states / message cards** now sit on a glass panel; if they look too pale, use `Surface` instead of `Panel`.
4. Video player and Shorts keep their own dark backdrop by design (the palette is overridden there).

---

## Revision 2 — the three things your screenshot showed

Your screenshot (5:03, light theme) confirmed the build boots and the glass chrome renders, and it showed
three defects. All three are fixed in this revision:

| What you asked | What was actually wrong | Fix |
|---|---|---|
| "In corner logo also blue" / "liquid glass in corner left side corner need red to blue" | The red mark was **not** the launcher icon — it was the in-app brand vector `res/drawable/ic_litube_mark.xml`, whose fill was still Litube's `#BB202D`. That single file draws the mark next to the wordmark on Home and on the empty state. | Fill → `#0A84FF`. Verified inside the signed APK: the compiled binary XML (`res/9j.xml`, R8-resource-optimised name) now contains the ARGB value `FF0A84FF`, and **zero** occurrences of `#BB202D` remain anywhere in `res/`. |
| "i need liquid glass soft animation a water type liquid" | Round 1's glass was completely static. | New `Modifier.liquidSheen(periodMillis, intensity, corner)` in `LiquidGlass.kt` — three superimposed layers: a translucent **current** band sweeping left→right, a **radial blob** drifting around the leading (left) corner, and a travelling **glint**. Applied to the floating top bar (7 200 ms — slowest, dominant), the nav dock (9 600 ms, 0.85× intensity), and the selected chip (5 200 ms, 0.7×, corner blob off so the small pill doesn't strobe). |
| "Towfi…" truncated wordmark | Round 1 widened the mark and set the wordmark to 22 sp with no constraint, so the title ellipsised. | Wordmark is now 19 sp / 24 sp line, `maxLines = 1`, mark 28 dp, and the brand block uses `weight(1f, fill = false)` with the trailing `Spacer(weight(1f))` removed — so the title takes exactly the width it needs and the search button stays right-aligned. |

Design intent of the sheen, so you can tell me which knob to turn:

- it is **slow and soft on purpose** — a full sweep takes 7.2 s and the light is low-alpha (dark theme band `#2E9CD0FF`, blobs `#2A5FA8F5`/`#336FB4FF`; light theme `#73FFFFFF`, `#66C9E4FF`, `#80FFFFFF`), so it reads as light moving under glass rather than a flashing highlight;
- it respects **Motion scale**: if the system "Remove animations" setting is on (`animator_duration_scale = 0`), the surface freezes at a pleasant static frame instead of animating — no motion-sickness trigger, no wasted frames;
- it is deliberately **not** on every feed card, only on the floating chrome. Animating dozens of cards costs battery and hurts text legibility. If you want a touch of motion on thumbnails too, that's a one-line change.

Two compile errors were hit and fixed on the way (noted so you know the build wasn't a lucky pass): a private helper `dark()` isn't visible from the top-level modifier (now fully qualified `AppAppearance.dark ?: isSystemInDarkTheme()`), which is also what broke the earlier attempt at naming the local `val dark`.

Recompiled clean: `:app:assembleRelease` → **BUILD SUCCESSFUL in 8m 36s** (R8 + resource shrinking). Re-signed, re-aligned, re-verified:
`v2 = true, v3 = true`, signer cert SHA-256 `07:34:A1:93:…:CD:3F` (same key as before), `application-label 'Towfik Youtube'`, versionCode 400.

`design-preview.html` was updated to animate the same three sheen periods so you can judge the *feel* of the motion in a browser before flashing the APK.

---

## Why this build is different from the last one

Last turn I could only patch the compiled APK, and I said a real glass UI needed the source.
The source you just uploaded **is** the Litube 4.0.0 project that produces `com.hhst.litube` — so this
build is the honest version of the same request: the home screen is now changed **in Kotlin**, compiled
with the project's own Gradle/AGP/Compose toolchain, not smali-patched.

| | |
|---|---|
| Package | `com.hhst.litube` (unchanged) |
| Version | 4.0.0 · versionCode 400 (unchanged) |
| minSdk / targetSdk | 24 / 36 |
| Toolchain | JDK 21 · Gradle 8.11.1 · AGP 8.10.1 · Kotlin 2.2.20 · compileSdk 36 |
| Build | `:app:assembleRelease` → **BUILD SUCCESSFUL in 10m 40s**, R8 minify + resource shrinking |

---

## 1. What "Liquid Glass Blue" now means in the code

### New file — `ui/design/LiquidGlass.kt` (133 lines)
The glass language, implemented once and reused:

- `LiquidGlass.aurora()` — soft blue gradient wash behind the home feed (light *and* dark).
- `LiquidGlass.fill()` / `fillStrong()` / `fillAccent()` — high-alpha translucent gradients.
- `LiquidGlass.hairline()` / `highlight()` / `shadowColor()` — 1 dp edge, inner top highlight, ambient shadow.
- `Modifier.liquidGlass(shape, elevation, accent)` — one modifier that applies fill + shadow + hairline + top highlight together.
- `Modifier.glassMediaFrame(radius)` — rounded frame + hairline for thumbnails.

**Honest technical limit:** Jetpack Compose cannot sample what is drawn *behind* a node, so there is no true
backdrop blur. The frosted look is produced the way non-native glass skins do it: a high-alpha translucent
gradient over a low-contrast aurora, plus the hairline and the inner highlight. On Android 12+ the underlying
`backdrop-filter`-style blur would need a `RenderEffect` on a captured layer, which Compose does not expose
per-node — so what you get is "frosted", not optically blurred.

### Changed files

| File | Change |
|---|---|
| `ui/design/LiquidGlass.kt` **(new)** | the whole glass system |
| `ui/theme/Color.kt` | full blue palette: accent `#0A84FF` (light) / `#6FB4FF` (dark), ice-bg `#EEF4FC`, navy `#070E1A` |
| `ui/design/AppPalette.kt` | all 12 app tokens re-mapped to blue (ink, secondary, surface, ghost, border, divider, scrim, state layer, link) |
| `ui/theme/Theme.kt` | Material3 `primary` → glass blue; dark `surfaceContainer` → navy `#101F33` |
| `home/presentation/HomeScreen.kt` | **aurora background**; **floating glass top bar** (24 dp radius, brand + search); **glass chip row** (selected chip = solid blue glass); **floating glass nav dock** (26 dp radius, 12 dp side margins) replacing the flat bar + divider; empty-state search pill → glass; chrome metrics re-tuned (top inset 98/110 → 124/136 dp) so nothing hides under the floating bars |
| `home/presentation/FeedCards.kt` | thumbnails get `glassMediaFrame` (16 dp phone / 18 dp grid) instead of a hard clip; duration badge → dark glass pill with hairline |
| `ui/about/AboutActivity.kt` | **update check removed from source** — no GitHub request, no "Stable release available" state possible |
| `res/drawable/ic_launcher_foreground.xml` | adaptive foreground `#BB202D` → `#0A84FF` |
| `res/mipmap-*dpi/ic_launcher.png` | 5 densities replaced with the blue version of your splash logo (same artwork, hue-shifted, white play triangle preserved) |
| `res/values*/strings.xml` (92 files) | **460 strings** rebranded `Litube` → `Towfik Youtube`, 0 occurrences left |

The in-app wordmark already read `R.string.app_name`, so the top-bar title now says **Towfik Youtube** with
no extra code. Nothing else was touched: no permissions, no endpoints, no libraries, no data/schema changes.

---

## 2. Verification — what passed, and what did not

**Static checks (passed)**
- ✅ `BUILD SUCCESSFUL` — Kotlin + R8 + resource shrinking, no compile errors
- ✅ `apksigner verify --verbose` → **v2 = true, v3 = true**
- ✅ `aapt2 dump badging` → `package com.hhst.litube`, versionCode 400, versionName 4.0.0, targetSdk 36
- ✅ `application-label: 'Towfik Youtube'` in every locale (bn, hi, ar, bg … 131 strings matched)
- ✅ launcher icon inside the final APK is `rgb(10,132,255)` = `#0A84FF` at **all 5 densities**
- ✅ `api.github.com` **0 occurrences** in `classes.dex` → the update lookup is really gone
- ✅ `liquidGlass` / `glassMediaFrame` present in the compiled dex
- ✅ 0 remaining "Litube" strings in resources
- ✅ in-app corner mark compiled as `FF0A84FF`, 0 remaining `#BB202D` in `res/`

**Not tested — be clear**
- ❌ **The app was never launched.** No emulator or device exists in this environment. I cannot claim the
  home screen renders correctly, that the glass looks right at your screen density, or that nothing regressed.
- ❌ No runtime check of scrolling under the floating bars, dark mode, tablet widths, or the chip row animation.
- `design-preview.html` is a **mock rendered from the same tokens**, not a screenshot.

**Known cosmetic risks to check first on device**
1. Floating bars are taller than the previous flat chrome — feed top inset was raised to 124 dp (phone) / 136 dp (grid); if a card is clipped under the search bar, that padding needs +4 dp.
2. Translucent bars let content ghost through by design; if it looks muddy on your wallpaper/AMOLED, raise the fill alpha in `LiquidGlass.fillStrong()`.
3. Thumbnails now have a 16 dp radius in compact (phone) layout, where they used to be square-cornered.

---

## 3. Signature / installation

Signed with the **same local key as last turn's build** (`keys/towfik-release.keystore`, alias `towfik`,
cert SHA-256 `07:34:A1:93:…:CD:3F`), so this **updates over the blue-mod APK I gave you earlier** —
no uninstall needed if that one is installed. If you still have the original `Towfik Youtube_4.0.0.apk`
(modder-signed), that one **must be uninstalled first** and its data will be erased.

1. Copy the APK to the phone → open it → allow *Install unknown apps* if asked.
2. Play Protect may warn (normal for any self-signed APK).
3. First launch → grant notifications if you want playback controls in the shade.

---

## 4. Still open

- **The dialog you see when the app opens.** The source confirms the app has no launch dialog: no
  onboarding, no "what's new", no first-run prompt, and the update notice is only ever produced on the
  About screen (now removed). The notification permission is requested inside `PlaybackActivity`, i.e. when
  a video opens, not at launch. So whatever appears at startup is either an Android system dialog or a
  prompt from the build you currently have installed. **Send one screenshot and I will remove it** — now
  that I have the source, that is a surgical change instead of a smali guess.
- If you want the glass stronger (more/less transparency, bigger corner radius, tinted thumbnails, glass
  sheets/menus too), those are one-line value changes in `LiquidGlass.kt` + a rebuild.
