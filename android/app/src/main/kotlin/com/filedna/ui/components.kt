package com.filedna.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun StatCard(icon: ImageVector, title: String, value: String, color: Color = MaterialTheme.colorScheme.secondary, onClick: () -> Unit = {}) {
    Card(modifier = Modifier.fillMaxWidth().padding(4.dp), elevation = 1.dp, onClick = onClick) {
        Column(modifier = Modifier.fillMaxSize().padding(12.dp), horizontalAlignment = Alignment.Start, verticalArrangement = Arrangement.Center, spacing = 4.dp) {
            Icon(imageVector = icon, contentDescription = title, tint = color, modifier = Modifier.size(24.dp))
            Text(text = title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimary)
            Text(text = value, style = MaterialTheme.typography.h5, color = MaterialTheme.colorScheme.onPrimary)
        }
    }
}

@Composable
fun NavItem(icon: ImageVector, text: String, selected: Boolean, onClick: () -> Unit) {
    TextButton(selected = selected, onClick = onClick, modifier = Modifier.padding(4.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center, spacing = 4.dp) {
            Icon(imageVector = icon, contentDescription = text, tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary, contentScale = ImageView.ContentScale.Crop)
            Text(text = text, style = MaterialTheme.typography.body1, color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface, maximally = 1)
        }
    }
}

@Composable
fun ProgressBarIndeterminate(modifier: Modifier = Modifier) {
    OutlinedBar(modifier = modifier.width(240.dp).height(4.dp), progress = 0f, colors = OutlinedBarDefaults.colors(progressColor = MaterialTheme.colorScheme.primary), style = OutlinedBarStyle.Medium)
}

@Composable
fun FileRow(fileName: String, fileSize: String, fileCategory: String, sha256: String?, onSelect: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), elevation = 0.dp, colors = CardDefaults.colors(containerColor = MaterialTheme.colorScheme.surface, shadowColor = Color.Transparent)) {
        Row(modifier = Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, contentPadding = Modifier.padding(12.dp)) {
            Box(modifier = Modifier.size(32.dp).background(when (fileCategory) {"image" -> Color(0xFFFFF3E0), "audio" -> Color(0xFFE3F2FD), "video" -> Color(0xFFE8F5E9), "document" -> Color(0xFFF3E5F5), "archive" -> Color(0xFFF1F8E9), "executable" -> Color(0xFFECf5FF), "code" -> Color(0xFFE8EAED), else -> Color(0xFFFAFAFA))) {
                Icon(imageVector = Icons.Default.insert_drive_file, contentDescription = fileName, tint = MaterialTheme.colorScheme.onSurface)
            }
            Column(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, verticalArrangement = Arrangement.Center) {
                Text(text = fileName, style = MaterialTheme.typography.body2, color = MaterialTheme.colorScheme.onSurface, overflow = TextOverflow.Ellipsis, maxLines = 1)
                Text(text = fileSize, style = MaterialTheme.typography.caption, color = MaterialTheme.colorScheme.onSurfaceVariant, overflow = TextOverflow.Ellipsis, maxLines = 1)
            }
            if (sha256 != null) {
                Text(text = sha256.substring(0, 16) + "...", style = MaterialTheme.typography.caption, color = MaterialTheme.colorScheme.onSurface, overflow = TextOverflow.Ellipsis, maxLines = 1)
            } else {
                Text(text = "No hash", style = MaterialTheme.typography.caption, color = MaterialTheme.colorScheme.onSurfaceVariant, overflow = TextOverflow.Ellipsis, maxLines = 1)
            }
        }
    }
}