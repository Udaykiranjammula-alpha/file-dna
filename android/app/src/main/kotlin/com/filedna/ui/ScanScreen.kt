package com.filedna.ui

import androidx.compose.foundation.FilePicker
import androidx.compose.foundation.layout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.nativeclass
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.scope.given
import androidx.compose.ui.unit.dp
import com.filedna.shared.ScanEngine
import com.filedna.shared.ScanEngine.ScanProgressListener
import java.io.File

@Composable
fun ScanScreen(scanEngine: ScanEngine, onFileSelected: (File) -> Unit) {
    var folderPath by remember { mutableStateOf<String?>(null) }
    var scanInProgress by remember { mutableStateOf(false) }
    var progressPercent by remember { mutableStateOf(0f) }
    var filesFound by remember { mutableStateOf(0) }
    var filesProcessed by remember { mutableStateOf(0) }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // Folder selection
        Card(modifier = Modifier.fillMaxWidth(), elevation = 1.dp) {
            CardHeader(title = { Text("Select Folder to Scan") })
            Column(
                modifier = Modifier.fillMaxSize().padding(8.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.Start
            ) {
                OutlinedTextField(
                    value = folderPath ?: "",
                    onValueChange = { folderPath = if (it.isNotEmpty()) it else null },
                    label = { Text("Folder Path") },
                    readOnly = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Button(onClick = { /* open folder picker */ }) {
                    Text("Browse")
                }
            }
        }

        // Scan controls
        if (!scanInProgress) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Button(onClick = { /* start scan */ }) {
                    Text("Start Scan")
                }
                Button(onClick = { /* cancel scan */ }) {
                    Text("Cancel")
                }
            }
        } else {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Scanning... ${progressPercent.floorToInt()}%")
                ProgressBarIndeterminate(modifier = Modifier.width(200.dp))
                Text("Files: $filesFound found, $filesProcessed processed")
            }
        }

        // File list
        Card(modifier = Modifier.fillMaxSize().weight(1f), elevation = 1.dp) {
            Column(
                modifier = Modifier.fillMaxSize().padding(8.dp),
                verticalArrangement = Arrangement.Start,
                horizontalAlignment = Alignment.Start
            ) {
                if (filesFound == 0 && filesProcessed == 0) {
                    Text("No files scanned yet", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    // File list
                    val files = mutableListOf<File>()
                    // This would be populated from scan results
                    if (files.isEmpty()) {
                        Text("No files found", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        files.forEach { file ->
                            FileRow(
                                fileName = file.name,
                                fileSize = formatFileSize(file.length()),
                                fileCategory = "other",
                                sha256 = FileHashing.calculateSha256(file.path),
                                onSelect = { onFileSelected(file) }
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun formatFileSize(size: Long): String {
    val kb = 1024f
    val mb = kb * 1024f
    if (size < kb) "${size} B"
    else if (size < mb) "${(size / kb).formattedNumber} KB"
    else "${(size / mb).formattedNumber} MB"
}