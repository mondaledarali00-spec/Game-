package com.hhst.youtubelite.ui.design

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

data class AppPalette(
    val background: Color,
    val ink: Color,
    val secondary: Color,
    /** Secondary container: chips, pressed pills, quiet surfaces. */
    val surface: Color,
    /** Stronger state container: selected rows, skeletons, banners. */
    val ghost: Color,
    val border: Color,
    val navigationDivider: Color,
    val scrim: Color,
    val menuScrim: Color,
    /** Immediate press response under icons and rows. */
    val stateLayer: Color,
    /** Opaque ink-on-glass pair: text/icons drawn on an [ink] or accent fill. */
    val contrast: Color,
    val red: Color,
    val link: Color,
)

// Liquid Glass Blue: screens no longer paint a flat colour — they let the
// wallpaper through and let translucent glass panels sit on top of it.
val LightAppPalette = AppPalette(
    background = Color.Transparent,
    ink = Color(0xFF0B1B2E),
    secondary = Color(0xFF31445C),
    surface = Color(0x8CFFFFFF),
    ghost = Color(0xB8FFFFFF),
    border = Color(0x99FFFFFF),
    navigationDivider = Color.Transparent,
    scrim = Color(0xFF04101F).copy(alpha = 0.32f),
    menuScrim = Color(0xFF04101F).copy(alpha = 0.58f),
    stateLayer = Color(0x1A0A84FF),
    contrast = Color(0xFFFFFFFF),
    red = Color(0xFFE8112D),
    link = Color(0xFF0A84FF),
)

val DarkAppPalette = AppPalette(
    background = Color.Transparent,
    ink = Color(0xFFEDF4FF),
    secondary = Color(0xFFAFC4DC),
    surface = Color(0x3DFFFFFF),
    ghost = Color(0x5CFFFFFF),
    border = Color(0x29FFFFFF),
    navigationDivider = Color.Transparent,
    scrim = Color(0xFF00040A).copy(alpha = 0.55f),
    menuScrim = Color(0xFF00040A).copy(alpha = 0.72f),
    stateLayer = Color(0x24FFFFFF),
    contrast = Color(0xFF06121F),
    red = Color(0xFFFF4D5E),
    link = Color(0xFF6FB4FF),
)

val LocalAppColors = staticCompositionLocalOf { LightAppPalette }
