package com.filedna.ui

import androidx.compose.foundation.layout
import androidx.compose.foundation.relayout
import androidx.compose.material3.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.filedna.shared.ScanEngine
import com.filedna.shared.ScanEngine.ScanSummary

@Composable
fun DashboardScreen(scanEngine: ScanEngine) {
    val selectedNavItem = remember { mutableStateOf(NavItem.Dashboard) }
    val scaffoldState = rememberScaffoldState()

    Scaffold(
        scaffoldState = scaffoldState,
        topBar = {
            TopAppBar(
                title = { Text(text = "File DNA") },
                actions = {
                    Button(onClick = { /* export report */ }) {
                        Text("Export")
                    }
                }
            )
        }
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Scan status section
            Card(modifier = Modifier.fillMaxWidth().height(120.dp), elevation = 1.dp) {
                CardHeader(title = { Text("Scan Status") })
                Column(
                    modifier = Modifier.fillMaxSize().padding(8.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.Start
                ) {
                    Text(text = "State: ${scanEngine.getState()}", style = MaterialTheme.typography.body Medium)
                    if (scanEngine.getState() == "scanning") {
                        ProgressBarIndeterminate()
                    }
                }
            }

            // Statistics cards
            val stats = remember { mutableMapOf<String, String>() }
            Row(verticalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                StatCard(
                    icon = Icons.Default.delete,
                    title = "Duplicates Found",
                    value = "0",
                    onClick = {}
                )
                StatCard(
                    icon = Icons.Default.remove,
                    title = "Space Recoverable",
                    value = "0 MB",
                    onClick = {}
                )
            }

            // Recent scans section
            Card(modifier = Modifier.fillMaxWidth().height(200.dp), elevation = 1.dp) {
                CardHeader(title = { Text("Recent Scans") })
                // Placeholder for recent scans list
                Text(text = "No scans yet", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            // Quick actions
            TextButton(onClick = { /* start scan */ }) {
                Text("Start New Scan")
            }
        }
    }
}