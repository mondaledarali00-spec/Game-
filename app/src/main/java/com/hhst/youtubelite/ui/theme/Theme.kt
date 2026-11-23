package com.hhst.youtubelite.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color

// Specify container roles too: Material defaults otherwise reintroduce purple
// on dialogs, menus and selected controls in the neutral app palette.
private val LightColorScheme = lightColorScheme(
    primary = LightPrimary,
    onPrimary = LightOnPrimary,
    primaryContainer = LightSurfaceVariant,
    onPrimaryContainer = LightOnSurface,
    secondary = LightSecondary,
    onSecondary = LightOnSecondary,
    secondaryContainer = LightSurfaceVariant,
    onSecondaryContainer = LightOnSurface,
    tertiary = LightSecondary,
    onTertiary = LightOnSecondary,
    tertiaryContainer = LightSurfaceVariant,
    onTertiaryContainer = LightOnSurface,
    // Screens are transparent so the glass wallpaper shows through; anything
    // that paints a panel uses a high-alpha white so text keeps its contrast.
    background = Color.Transparent,
    onBackground = LightOnBackground,
    surface = Color(0xE6FFFFFF),
    onSurface = LightOnSurface,
    surfaceVariant = Color(0x9EFFFFFF),
    onSurfaceVariant = LightOnSurfaceVariant,
    surfaceTint = Color.Transparent,
    surfaceDim = Color(0xD9EAF1FC),
    surfaceBright = Color(0xF2FFFFFF),
    surfaceContainerLowest = Color(0x80FFFFFF),
    surfaceContainerLow = Color(0xB3FFFFFF),
    surfaceContainer = Color(0xCCFFFFFF),
    surfaceContainerHigh = Color(0xE0FFFFFF),
    surfaceContainerHighest = Color(0xF0FFFFFF),
    inverseSurface = DarkSurface,
    inverseOnSurface = DarkOnSurface,
    inversePrimary = DarkPrimary,
    outline = LightOutline,
    outlineVariant = LightOutline,
    error = YtRed,
)

private val DarkColorScheme = darkColorScheme(
    primary = DarkPrimary,
    onPrimary = DarkOnPrimary,
    primaryContainer = DarkSurfaceVariant,
    onPrimaryContainer = DarkOnSurface,
    secondary = DarkSecondary,
    onSecondary = DarkOnSecondary,
    secondaryContainer = DarkSurfaceVariant,
    onSecondaryContainer = DarkOnSurface,
    tertiary = DarkSecondary,
    onTertiary = DarkOnSecondary,
    tertiaryContainer = DarkSurfaceVariant,
    onTertiaryContainer = DarkOnSurface,
    background = Color.Transparent,
    onBackground = DarkOnBackground,
    surface = Color(0xE60B1626),
    onSurface = DarkOnSurface,
    surfaceVariant = Color(0x29FFFFFF),
    onSurfaceVariant = DarkOnSurfaceVariant,
    surfaceTint = Color.Transparent,
    surfaceDim = Color(0xE60A1524),
    surfaceBright = Color(0xE6132639),
    surfaceContainerLowest = Color(0x1FFFFFFF),
    surfaceContainerLow = Color(0x29000000),
    surfaceContainer = Color(0x3D0B1626),
    surfaceContainerHigh = Color(0xB30B1626),
    surfaceContainerHighest = Color(0xCC13233A),
    inverseSurface = LightSurface,
    inverseOnSurface = LightOnSurface,
    inversePrimary = LightPrimary,
    outline = DarkOutline,
    outlineVariant = DarkOutline,
    error = YtRed,
)

/**
 * App [MaterialTheme]. [dynamicColor] (API 31+) uses wallpaper colors; default
 * is the fixed brand palette for consistent red accents.
 */
@Composable
fun AppTheme(
    darkTheme: Boolean = AppAppearance.dark ?: isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) {
                dynamicDarkColorScheme(context)
            } else {
                dynamicLightColorScheme(context)
            }
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    com.hhst.youtubelite.ui.design.AppHapticFeedback { MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        shapes = AppStyle.Shapes,
        content = content,
    ) }
}
