package com.hhst.youtubelite.ui.design

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.sin

/**
 * Towfik Youtube — Liquid Glass surface language.
 *
 * A glass surface is a translucent gradient fill + a 1dp light hairline +
 * an inner top highlight + a soft ambient shadow. It is purely decorative:
 * it never changes layout, hit targets, semantics or scrolling behaviour.
 *
 * Compose has no true backdrop blur (there is no way to sample what is drawn
 * behind a node), so the frosted read comes from a high-alpha translucent fill
 * over the aurora background plus the hairline and highlight. That is the same
 * technique iOS-style "liquid glass" skins use outside of native UIKit/AppKit.
 */
object LiquidGlass {

    /** Set while the app is in dark appearance. */
    @Composable
    private fun dark(): Boolean =
        com.hhst.youtubelite.ui.theme.AppAppearance.dark ?: isSystemInDarkTheme()

    /** Soft aurora wash used behind glass chrome. */
    @Composable
    fun aurora(): Brush = if (dark()) {
        Brush.linearGradient(
            listOf(Color(0xFF070E1A), Color(0xFF0C1A2E), Color(0xFF081020), Color(0xFF0A1526)),
            start = Offset.Zero,
            end = Offset(900f, 1800f),
        )
    } else {
        Brush.linearGradient(
            listOf(Color(0xFFE8F1FF), Color(0xFFF6FAFF), Color(0xFFE3EEFF), Color(0xFFF2F8FF)),
            start = Offset.Zero,
            end = Offset(900f, 1800f),
        )
    }

    /**
     * Body of a glass panel: milky white in light, cool navy in dark. High
     * enough alpha to keep text legible over the wallpaper, low enough that the
     * wallpaper's light still moves underneath — the reference's whole look.
     */
    @Composable
    fun fill(): Brush = if (dark()) {
        Brush.verticalGradient(listOf(Color(0xB31C2C45), Color(0x8C0D1828)))
    } else {
        Brush.verticalGradient(listOf(Color(0xD9FFFFFF), Color(0xB3F1F7FF)))
    }

    /** Slightly stronger fill for floating chrome (nav dock, top bar). */
    @Composable
    fun fillStrong(): Brush = if (dark()) {
        Brush.verticalGradient(listOf(Color(0xCC1E304D), Color(0xA6101D33)))
    } else {
        Brush.verticalGradient(listOf(Color(0xEBFFFFFF), Color(0xD1EFF6FF)))
    }

    /** Selected / accented glass (blue). */
    @Composable
    fun fillAccent(): Brush = if (dark()) {
        Brush.verticalGradient(listOf(Color(0xF56FB4FF), Color(0xE63D8BE0)))
    } else {
        Brush.verticalGradient(listOf(Color(0xFA3D9BFF), Color(0xEF0A6FE0)))
    }

    @Composable
    fun hairline(): Color = if (dark()) Color(0x38FFFFFF) else Color(0xF2FFFFFF)

    @Composable
    fun highlight(): Color = if (dark()) Color(0x7ABFDCFF) else Color(0xFFFFFFFF)

    @Composable
    fun shadowColor(): Color = if (dark()) Color(0xA6000000) else Color(0x2E1A4272)

    /** Thumbnail / media frame hairline, drawn inside media bounds. */
    @Composable
    fun mediaHairline(): Color = if (dark()) Color(0x26FFFFFF) else Color(0x59FFFFFF)
}

/**
 * Applies the glass surface to this node. [elevation] is a soft ambient
 * shadow only — it does not affect layout.
 */
@Composable
fun Modifier.liquidGlass(
    shape: Shape = RoundedCornerShape(22.dp),
    elevation: Dp = 10.dp,
    accent: Boolean = false,
): Modifier {
    val fill = if (accent) LiquidGlass.fillAccent() else LiquidGlass.fillStrong()
    val hairline = LiquidGlass.hairline()
    val highlight = LiquidGlass.highlight()
    val ambient = LiquidGlass.shadowColor()
    return this
        .shadow(elevation, shape, clip = false, ambientColor = ambient, spotColor = ambient)
        .clip(shape)
        .background(fill, shape)
        .drawWithContent {
            drawContent()
            // Inner top highlight: the "wet" edge that sells the glass.
            drawLine(
                brush = Brush.horizontalGradient(
                    listOf(Color.Transparent, highlight.copy(alpha = highlight.alpha * 0.9f), Color.Transparent),
                ),
                start = Offset(size.width * 0.12f, 0.5f),
                end = Offset(size.width * 0.88f, 0.5f),
                strokeWidth = 1.5f,
            )
        }
        .border(1.dp, hairline, shape)
}

/** Rounded media frame with a hairline edge, for thumbnails inside cards. */
@Composable
fun Modifier.glassMediaFrame(radius: Dp = 18.dp): Modifier {
    val shape = RoundedCornerShape(radius)
    val edge = LiquidGlass.mediaHairline()
    return this
        .clip(shape)
        .border(1.dp, edge, shape)
}

/**
 * Liquid motion: a slow water-like current flowing across a glass surface.
 *
 * Two layers, both drawn *underneath* the node's content so text and icons stay
 * crisp: a soft diagonal band that sweeps across the surface, and a drifting
 * radial blob anchored near the leading corner — the "water" reading.
 *
 * Respects [LocalMotionScale]: when the system animator scale is 0 the surface
 * stays static instead of animating (no motion-sickness trigger, no battery cost).
 */
@Composable
fun Modifier.liquidSheen(
    periodMillis: Int = 7200,
    intensity: Float = 1f,
    corner: Boolean = true,
): Modifier {
    val motion = LocalMotionScale.current
    val animated = motion > 0f
    val progress = if (animated) {
        val transition = rememberInfiniteTransition(label = "liquid-glass")
        transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(periodMillis, easing = LinearEasing),
                repeatMode = RepeatMode.Restart,
            ),
            label = "liquid-flow",
        ).value
    } else {
        0.4f
    }
    val isDark = com.hhst.youtubelite.ui.theme.AppAppearance.dark ?: isSystemInDarkTheme()
    val band = if (isDark) Color(0x2E9CD0FF) else Color(0x73FFFFFF)
    val blob = if (isDark) Color(0x2A5FA8F5) else Color(0x66C9E4FF)
    val spark = if (isDark) Color(0x336FB4FF) else Color(0x80FFFFFF)

    return this.drawWithContent {
        val w = size.width.coerceAtLeast(1f)
        val h = size.height.coerceAtLeast(1f)

        // 1) water current: a translucent band sweeping left -> right
        val sweep = (-0.45f + 1.9f * progress) * w
        drawRect(
            brush = Brush.linearGradient(
                colors = listOf(Color.Transparent, band, Color.Transparent),
                start = Offset(sweep - w * 0.42f, 0f),
                end = Offset(sweep + w * 0.42f, h),
            ),
            alpha = intensity,
        )

        // 2) drifting blob near the leading corner (the "liquid" body)
        if (corner) {
            val cx = w * (0.02f + 0.16f * progress)
            val cy = h * (0.40f + 0.16f * sin(progress * 2f * PI.toFloat()).toFloat())
            val r = max(w, h) * 0.62f
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(blob, Color.Transparent),
                    center = Offset(cx, cy),
                    radius = r,
                ),
                radius = r,
                center = Offset(cx, cy),
                alpha = intensity,
            )
        }

        // 3) a small travelling glint, like light on wet glass
        val gx = (-0.2f + 1.4f * progress) * w
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(spark, Color.Transparent),
                center = Offset(gx, h * 0.30f),
                radius = h * 0.55f,
            ),
            radius = h * 0.55f,
            center = Offset(gx, h * 0.30f),
            alpha = intensity * 0.8f,
        )

        drawContent()
    }
}

private class WallpaperBloom(val x: Float, val y: Float, val radius: Float, val color: Color)

private val lightWallpaperBlooms = listOf(
    WallpaperBloom(0.10f, -0.04f, 0.86f, Color(0xA6FFFFFF)),
    WallpaperBloom(0.94f, 0.10f, 0.62f, Color(0x4D9CD0FF)),
    WallpaperBloom(0.88f, 0.72f, 0.78f, Color(0x3D7FBCF5)),
    WallpaperBloom(0.02f, 0.94f, 0.70f, Color(0x3396C6FF)),
    WallpaperBloom(0.46f, 0.42f, 0.95f, Color(0x1FFFFFFF)),
)

private val darkWallpaperBlooms = listOf(
    WallpaperBloom(0.12f, 0.02f, 0.80f, Color(0x4D2C6BD8)),
    WallpaperBloom(0.96f, 0.14f, 0.60f, Color(0x3D2E7FD4)),
    WallpaperBloom(0.86f, 0.74f, 0.72f, Color(0x33206BA8)),
    WallpaperBloom(0.04f, 0.92f, 0.66f, Color(0x2E1B5FA8)),
    WallpaperBloom(0.50f, 0.46f, 0.98f, Color(0x1A0F3B6E)),
)

/**
 * Compose twin of [GlassWallpaperDrawable], for hosts that own their window and
 * therefore never receive the window-background backdrop — the watch page, whose
 * activity sets its own backing colour so the player can hand off between page
 * and fullscreen. Same layers, same numbers, so both paths look identical.
 */
@Composable
fun Modifier.glassWallpaper(): Modifier {
    val isDark = com.hhst.youtubelite.ui.theme.AppAppearance.dark ?: isSystemInDarkTheme()
    val base = if (isDark) {
        listOf(Color(0xFF050A13), Color(0xFF0A1526), Color(0xFF07101D), Color(0xFF04080F))
    } else {
        listOf(Color(0xFFE9F1FD), Color(0xFFF8FBFF), Color(0xFFE4EEFC), Color(0xFFF3F8FF))
    }
    val blooms = if (isDark) darkWallpaperBlooms else lightWallpaperBlooms
    return this.drawWithCache {
        val w = size.width.coerceAtLeast(1f)
        val h = size.height.coerceAtLeast(1f)
        val span = max(w, h)
        val sheet = Brush.linearGradient(base, start = Offset.Zero, end = Offset(w, h))
        val streak = Brush.linearGradient(
            listOf(
                Color.Transparent,
                if (isDark) Color(0x14FFFFFF) else Color(0x59FFFFFF),
                Color.Transparent,
            ),
            start = Offset(w * 0.05f, 0f),
            end = Offset(w * 0.85f, h * 0.55f),
        )
        val circles = blooms.map { bloom ->
            val radius = span * bloom.radius
            val center = Offset(w * bloom.x, h * bloom.y)
            Triple(center, radius, Brush.radialGradient(
                listOf(bloom.color, bloom.color.copy(alpha = 0f)),
                center = center,
                radius = radius,
            ))
        }
        onDrawBehind {
            drawRect(sheet)
            circles.forEach { (center, radius, brush) -> drawCircle(brush, radius, center) }
            drawRect(streak)
        }
    }
}

/** Fully-qualified call-site helper for [glassWallpaper]. */
@Composable
fun wallpaperModifier(): Modifier = Modifier.glassWallpaper()
