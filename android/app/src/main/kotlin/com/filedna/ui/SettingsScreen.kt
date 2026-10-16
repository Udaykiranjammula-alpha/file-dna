package com.filedna.ui

import androidx.compose.foundation.layout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SettingsScreen() {
    var autoScan by remember { mutableStateOf(true) }
    var includeHidden by remember { mutableStateOf(false) }
    var maxFileSize by remember { mutableStateOf(10L * 1024 * 1024 * 1024) }
    var theme by remember { mutableStateOf("System") }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // Appearance section
        Card(modifier = Modifier.fillMaxWidth().height(120.dp), elevation = 1.dp) {
            CardHeader(title = { Text("Appearance") })
            Column(
                modifier = Modifier.fillMaxSize().padding(8.dp),
                verticalArrangement = Arrangement.Center
            ) {
                OutlinedTextField(
                    value = theme,
                    onValueChange = { theme = it },
                    label = { Text("Theme") },
                    readOnly = true
                )
                OutlinedTextField(
                    value = "${(maxFileSize / (1024 * 1024 * 1024)).formattedNumber} GB",
                    onValueChange = { /* update max file size */ },
                    label = { Text("Max File Size") },
                    readOnly = true
                )
            }
        }

        // Scanning section
        Card(modifier = Modifier.fillMaxWidth().height(120.dp), elevation = 1.dp) {
            CardHeader(title = { Text("Scanning") })
            Column(
                modifier = Modifier.fillMaxSize().padding(8.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Switch(
                    checked = autoScan,
                    onCheckedChange = { autoScan = it },
                    label = { Text("Auto-start scan on app launch") }
                )
            }
        }

        // Privacy section
        Card(modifier = Modifier.fillMaxWidth().height(120.dp), elevation = 1.dp) {
            CardHeader(title = { Text("Privacy") })
            Column(
                modifier = Modifier.fillMaxSize().padding(8.dp),
                verticalArrangement = Arrangement.Center
            ) {
                OutlinedTextField(
                    value = "See privacy policy",
                    onValueChange = {},
                    label = { Text("Data Policy") },
                    readOnly = true
                )
                OutlinedTextField(
                    value = "Local only - no cloud upload",
                    onValueChange = {},
                    label = { Text("Storage") },
                    readOnly = true
                )
            }
        }

        // About section
        Card(modifier = Modifier.fillMaxWidth().height(80.dp), elevation = 1.dp) {
            CardHeader(title = { Text("About") })
            Column(
                modifier = Modifier.fillMaxSize().padding(8.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Text("File DNA 2.0", style = MaterialTheme.typography.bodyMedium)
                Text("by Uday Kiran Jammula", style = MaterialTheme.typography.caption, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // Action buttons
        Spacer(modifier = Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Button(onClick = { /* reset settings */ }) {
                Text("Reset")
            }
            Button(onClick = { /* exit */ }) {
                Text("Close")
            }
        }
    }
}