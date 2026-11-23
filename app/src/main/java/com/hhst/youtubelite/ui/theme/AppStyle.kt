package com.hhst.youtubelite.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

enum class ThemeMode(val label: String) { System("System"), Light("Light"), Dark("Dark") }

object AppAppearance {
    /** Resolved darkness for the Compose theme; null means "follow the system". */
    var dark by mutableStateOf<Boolean?>(null)
        private set
    var mode by mutableStateOf(ThemeMode.System)
        private set
    private val listeners = mutableListOf<() -> Unit>()

    fun update(value: ThemeMode) {
        mode = value
        dark = when (value) {
            ThemeMode.Dark -> true
            ThemeMode.Light -> false
            ThemeMode.System -> null
        }
        synchronized(listeners) { listeners.toList() }.forEach { it() }
    }

    /** Registers a non-Compose observer (system bars); returns the unsubscribe handle. */
    fun onChange(listener: () -> Unit): () -> Unit {
        synchronized(listeners) { listeners += listener }
        return { synchronized(listeners) { listeners -= listener } }
    }
}

object AppStyle {
    // Liquid glass reads through its corners: nothing smaller than 12 dp.
    val Shapes = Shapes(
        extraSmall = RoundedCornerShape(8.dp), small = RoundedCornerShape(12.dp),
        medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(20.dp),
        extraLarge = RoundedCornerShape(26.dp),
    )
    val SheetShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    val MenuShape = RoundedCornerShape(20.dp)
    /** Sheets, dialogs and popup menus share the page's neutral black/white surface.
     * Grey containers belong to controls and item states inside these panels. */
    val Panel: Color
        @Composable get() = MaterialTheme.colorScheme.surface
    val Action: Color
        @Composable get() = LocalActionColors.current?.foreground ?: MaterialTheme.colorScheme.onSurface
    val OnAction: Color
        @Composable get() = LocalActionColors.current?.background ?: MaterialTheme.colorScheme.surface
}

private data class ActionColors(val foreground: Color, val background: Color)
private val LocalActionColors = staticCompositionLocalOf<ActionColors?> { null }

@Composable
fun NeutralControls(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalActionColors provides ActionColors(
        MaterialTheme.colorScheme.onSurface, MaterialTheme.colorScheme.surface,
    ), content = content)
}
