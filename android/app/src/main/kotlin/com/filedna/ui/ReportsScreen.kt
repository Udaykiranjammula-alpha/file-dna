package com.filedna.ui

import androidx.compose.foundation.layout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.filedna.shared.ReportEngine

@Composable
fun ReportsScreen() {
    var reportType by remember { mutableStateOf("scan") }
    var exportFormat by remember { mutableStateOf("json") }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // Report type selector
        Card(modifier = Modifier.fillMaxWidth().height(80.dp), elevation = 1.dp) {
            CardHeader(title = { Text("Generate Report") })
            Row(
                modifier = Modifier.fillMaxWidth().padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                OutlinedTextField(
                    value = reportType,
                    onValueChange = { reportType = it },
                    label = { Text("Type") },
                    readOnly = true,
                )
                OutlinedTextField(
                    value = exportFormat,
                    onValueChange = { exportFormat = it },
                    label = { Text("Format") },
                    readOnly = true,
                )
            }
        }

        // Report content
        Card(modifier = Modifier.fillMaxSize().weight(1f), elevation = 1.dp) {
            Column(
                modifier = Modifier.fillMaxSize().padding(12.dp),
                verticalArrangement = Arrangement.Start,
                horizontalAlignment = Alignment.Start
            ) {
                when (reportType) {
                    "scan" -> {
                        Text("Folder Scan Report", style = MaterialTheme.typography.titleSmall)
                        // Placeholder for scan report content
                        Text("Scan summary and file analysis will appear here", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    "file" -> {
                        Text("File Analysis Report", style = MaterialTheme.typography.titleSmall)
                        Text("Individual file DNA analysis report", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    "duplicate" -> {
                        Text("Duplicate Detection Report", style = MaterialTheme.typography.titleSmall)
                        Text("Duplicate groups and recovery analysis", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    "metadata" -> {
                        Text("Metadata Summary Report", style = MaterialTheme.typography.titleSmall)
                        Text("Extracted metadata from scanned files", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                // Export buttons
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(onClick = { /* export report */ }) {
                        Text("Export Report")
                    }
                    OutlinedButton(onClick = { /* copy to clipboard */ }) {
                        Text("Copy")
                    }
                }
            }
        }
    }
}