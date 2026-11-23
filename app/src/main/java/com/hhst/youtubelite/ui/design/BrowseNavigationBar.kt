package com.hhst.youtubelite.ui.design

import androidx.compose.ui.res.stringResource
import com.hhst.youtubelite.R
import com.hhst.youtubelite.ui.design.labelResource
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

enum class BrowseDestination(val label: String) { Home("Home"), Shorts("Shorts"), Subscriptions("Subscriptions"), You("You") }

@Composable
fun BrowseNavigationBar(tag: String, signedIn: Boolean = false, onSelect: (BrowseDestination) -> Unit) {
    val haptic = com.hhst.youtubelite.ui.design.rememberHapticAction(com.hhst.youtubelite.core.HapticsController.Event.TAB)
    Box(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 2.dp, bottom = 10.dp).testTag("$tag-navigation")) {
        Row(Modifier.fillMaxWidth().height(56.dp)
            .liquidGlass(androidx.compose.foundation.shape.RoundedCornerShape(26.dp), 16.dp)
            .liquidSheen(periodMillis = 9600, intensity = 0.85f),
            verticalAlignment = Alignment.CenterVertically) {
            com.hhst.youtubelite.ui.components.MainTabs.tabs(signedIn, LocalHideShorts.current).forEach { tab ->
                val destination = BrowseDestination.valueOf(tab.name)
                Column(Modifier.weight(1f).fillMaxHeight()
                    .clickable(role = Role.Tab) { haptic(); onSelect(destination) }
                    .testTag("$tag-nav-${destination.name}"),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center) {
                    AppIcon(when (destination) {
                        BrowseDestination.Home -> AppIcon.HomeOutline
                        BrowseDestination.Shorts -> AppIcon.Shorts
                        BrowseDestination.Subscriptions -> AppIcon.Subscriptions
                        BrowseDestination.You -> AppIcon.You
                    })
                    AppText(stringResource(destination.labelResource), size = 11, line = 14, maxLines = 1)
                }
            }
        }
    }
}
