package com.filedna.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.px
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.isEnabled
import androidx.compose.foundation.clickable
import androidx.compose.foundation.indicator

// Color scheme matching the desktop app
val FileDNALightTheme = lightColorScheme(
    primary = Color(0xFF18181B),      // bg-primary
    secondary = Color(0xFFCFD8DC),    // text-secondary
    tertiary = Color(0xFF90A4AE),     // text-muted
    surface = Color(0xFFFFFFFF),       // bg-card
    onPrimary = Color(0xFFFFFFFF),     // text-on-primary
    onSurface = Color(0xFF212124),     // text-primary
    onSecondary = Color(0xFF212124),   // bg-on-secondary
    error = Color(0xFFCF6679),         // error
    container = Color(0xFFFFFFFF),     // bg-secondary
    onContainer = Color(0xFF212124),   // text-on-container
    outline = Color(0xFF6E6E6E),       // border-color
    inverseSurface = Color(0xFFF8F9FA),// bg-input
    onInverseSurface = Color(0xFF212124), // on-inverse-surface
    inverseOnSurface = Color(0xFFFFFFFF), // bg-on-inverse-surface
    brightness = LightDarkMode.LIGHT
)

// Dark theme matching the desktop app
val FileDNADarkTheme = darkColorScheme(
    primary = Color(0xFF18181B),      // bg-primary
    secondary = Color(0xFFCFD8DC),    // text-secondary
    tertiary = Color(0xFF90A4AE),     // text-muted
    surface = Color(0xFF0D0D10),       // bg-card
    onPrimary = Color(0xFFFFFFFF),     // text-on-primary
    onSurface = Color(0xFFFFFFFF),     // text-primary
    onSecondary = Color(0xFFFFFFFF),   // bg-on-secondary
    error = Color(0xFFCF6679),         // error
    container = Color(0xFF0D0D10),     // bg-secondary
    onContainer = Color(0xFFFFFFFF),   // text-on-container
    outline = Color(0xFF4A4A4A),       // border-color
    inverseSurface = Color(0xFF1E1E1F),// bg-input
    onInverseSurface = Color(0xFFFFFFFF), // on-inverse-surface
    inverseOnSurface = Color(0xFF212124), // bg-on-inverse-surface
    brightness = LightDarkMode.DARK
)