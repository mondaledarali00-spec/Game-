# NOTICE — modifications to Litube

This repository contains a **modified version** of [Litube](https://github.com/HydeYYHH/litube) 4.0.0
(package `com.hhst.litube`), distributed under the GNU General Public License v3.0 (see [LICENSE](LICENSE)).

In accordance with GPL-3.0 §5(a), the changes are marked here and described in detail in
[docs/CHANGE_REPORT.md](docs/CHANGE_REPORT.md). The modified sources are the ones in this repository.

**Base:** Litube 4.0.0 (versionCode 400), `Towfik Youtube Source.zip`, SHA-256 `4ba42f67…d35eb1654d`.
**Modified on:** 2026-11-23.
**Modifications:**

1. Rebranding — app label and 460 user-facing strings changed from "Litube" to "Towfik Youtube" across
   92 `res/values*/strings.xml` files; launcher icon and in-app mark recoloured to `#0A84FF`.
2. New "liquid glass" design system — added `ui/design/LiquidGlass.kt` and `ui/design/GlassWallpaper.kt`;
   modified `ui/design/AppPalette.kt`, `ui/design/DesignTokens.kt`, `ui/theme/Color.kt`, `ui/theme/Theme.kt`,
   `ui/theme/AppStyle.kt`, `ui/components/AppControls.kt`, `ui/components/MainNavigation.kt`,
   `ui/design/BrowseNavigationBar.kt`, `ui/design/SearchPanel.kt`, `ui/design/PullRefresh.kt`,
   `ui/design/SubscribeButton.kt`, `ui/NativeActivity.kt`.
3. Screen-level restyling — `home/presentation/HomeScreen.kt` (including moving search into a right-corner
   pill), `home/presentation/FeedCards.kt`, `watch/presentation/WatchScreen.kt`, `watch/WatchActivity.kt`,
   `channel/…`, `library/…`, `post/…`, `playlist/…`, `search/…`, `subscriptions/…`, `explore/…`.
4. Removed the GitHub `releases/latest` update check from `ui/about/AboutActivity.kt`.

No permissions, endpoints, third-party libraries, database schemas or user data handling were changed.

The name "Towfik Youtube" and this build are not affiliated with the Litube project or its authors. Bug reports
about this build should not be filed against upstream Litube.
