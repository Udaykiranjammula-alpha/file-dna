package com.filedna.ui

import androidx.compose.foundation.layout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.filedna.shared.ScanEngine
import com.filedna.shared.ScanEngine.ScanSummary

@Composable
fun DuplicatesScreen(scanEngine: ScanEngine) {
    val scaffoldState = rememberScaffoldState()

    Scaffold(
        scaffoldState = scaffoldState,
        topBar = {
            TopAppBar(
                title = { Text("Duplicate Finder") },
                actions = {
                    Button(onClick = { /* refresh */ }) {
                        Text("Refresh")
                    }
                }
            )
        }
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Scan summary
            Card(modifier = Modifier.fillMaxWidth().height(100.dp), elevation = 1.dp) {
                CardHeader(title = { Text("Scan Summary") })
                Column(
                    modifier = Modifier.fillMaxSize().padding(8.dp),
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(text = "Total Files: ${scanEngine.getState()}", style = MaterialTheme.typography.bodySmall)
                    if (scanEngine.getState() == "complete") {
                        Text("Analysis complete", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }

            // Duplicate groups
            Text(text = "Duplicate Groups", style = MaterialTheme.typography.titleMedium)

            // Placeholder for duplicate groups
            Card(modifier = Modifier.fillMaxSize().height(300.dp), elevation = 1.dp) {
                CardHeader(title = { Text("No Duplicate Groups Found") })
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "Run a scan to detect duplicate files\nbased on SHA-256 hash matches.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                }
            }

            // Recoverable space
            Card(modifier = Modifier.fillMaxWidth().height(80.dp), elevation = 1.dp) {
                CardHeader(title = { Text("Potential Savings") })
                Column(
                    modifier = Modifier.fillMaxSize().padding(8.dp),
                    verticalArrangement = Arrangement.Center
                ) {
                    Text("0 MB recoverable", style = MaterialTheme.typography.bodyMedium)
                    Text("Select duplicates to move to Recycle Bin", style = MaterialTheme.typography.caption, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}