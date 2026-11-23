package com.hhst.youtubelite.ui.design

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.drawable.Drawable
import kotlin.math.max

/**
 * Towfik Youtube — the backdrop every glass surface samples.
 *
 * A "liquid glass" panel is only convincing when there is something soft and
 * low-contrast behind it. The reference look is a heavily out-of-focus photo:
 * milky highlights top-left, a cool blue-grey body, a warm bloom bottom-right.
 * This reproduces that with layered radial gradients — no bitmap, no runtime
 * blur, and no hard edges, so translucent panels over it stay readable.
 *
 * **It is a window background on purpose, not a composable.** Activities in this
 * app stack several full-screen Compose overlays on top of the content view (the
 * mini player host, backdrops, sheets). A wallpaper drawn *inside* an app-level
 * theme gets repeated by every one of those overlays and ends up painting over
 * the screen behind them. As the window background it is drawn once, behind
 * every view in the window, and overlays stay genuinely transparent.
 */
class GlassWallpaperDrawable(val isDark: Boolean) : Drawable() {

    private class Bloom(val x: Float, val y: Float, val radius: Float, val color: Int)

    private val blooms = if (isDark) DarkBlooms else LightBlooms
    private val basePaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG)
    private val bloomPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG)
    private val streakPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG)
    private var builtWidth = -1
    private var builtHeight = -1

    private fun build(bounds: Rect) {
        val w = bounds.width().coerceAtLeast(1).toFloat()
        val h = bounds.height().coerceAtLeast(1).toFloat()
        val left = bounds.left.toFloat()
        val top = bounds.top.toFloat()
        val base = if (isDark) DARK_BASE else LIGHT_BASE
        basePaint.shader = LinearGradient(
            left, top, left + w, top + h,
            base, null, Shader.TileMode.CLAMP,
        )
        // One slow diagonal "window light" band, like the lit wall in the reference.
        streakPaint.shader = LinearGradient(
            left + w * 0.05f, top,
            left + w * 0.85f, top + h * 0.55f,
            intArrayOf(0x00FFFFFF, if (isDark) 0x14FFFFFF else 0x59FFFFFF, 0x00FFFFFF),
            floatArrayOf(0f, 0.5f, 1f),
            Shader.TileMode.CLAMP,
        )
        builtWidth = bounds.width()
        builtHeight = bounds.height()
    }

    override fun draw(canvas: Canvas) {
        val bounds = bounds
        if (bounds.isEmpty) return
        if (bounds.width() != builtWidth || bounds.height() != builtHeight) build(bounds)
        canvas.drawRect(bounds, basePaint)
        val w = bounds.width().toFloat()
        val h = bounds.height().toFloat()
        val span = max(w, h)
        blooms.forEach { bloom ->
            val radius = span * bloom.radius
            val cx = bounds.left + w * bloom.x
            val cy = bounds.top + h * bloom.y
            bloomPaint.shader = RadialGradient(
                cx, cy, radius,
                intArrayOf(bloom.color, bloom.color and 0x00FFFFFF),
                null,
                Shader.TileMode.CLAMP,
            )
            canvas.drawCircle(cx, cy, radius, bloomPaint)
        }
        canvas.drawRect(bounds, streakPaint)
    }

    override fun setAlpha(alpha: Int) = Unit

    override fun setColorFilter(colorFilter: ColorFilter?) = Unit

    override fun getOpacity(): Int = PixelFormat.OPAQUE

    private companion object {
        val LIGHT_BASE = intArrayOf(0xFFE9F1FD.toInt(), 0xFFF8FBFF.toInt(), 0xFFE4EEFC.toInt(), 0xFFF3F8FF.toInt())
        val DARK_BASE = intArrayOf(0xFF050A13.toInt(), 0xFF0A1526.toInt(), 0xFF07101D.toInt(), 0xFF04080F.toInt())

        val LightBlooms = listOf(
            Bloom(0.10f, -0.04f, 0.86f, 0xA6FFFFFF.toInt()),
            Bloom(0.94f, 0.10f, 0.62f, 0x4D9CD0FF),
            Bloom(0.88f, 0.72f, 0.78f, 0x3D7FBCF5),
            Bloom(0.02f, 0.94f, 0.70f, 0x3396C6FF),
            Bloom(0.46f, 0.42f, 0.95f, 0x1FFFFFFF),
        )

        val DarkBlooms = listOf(
            Bloom(0.12f, 0.02f, 0.80f, 0x4D2C6BD8),
            Bloom(0.96f, 0.14f, 0.60f, 0x3D2E7FD4),
            Bloom(0.86f, 0.74f, 0.72f, 0x33206BA8),
            Bloom(0.04f, 0.92f, 0.66f, 0x2E1B5FA8),
            Bloom(0.50f, 0.46f, 0.98f, 0x1A0F3B6E),
        )
    }
}
