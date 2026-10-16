package com.filedna.ui

import android.Manifest
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navigation
import com.filedna.shared.FileHashing
import com.filedna.shared.ScanEngine
import com.filedna.shared.MetadataExtractor
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var scanEngine: ScanEngine
    private var permissionsRequested = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Set up ScanEngine
        scanEngine = ScanEngine(
            progressListener = { totalFilesFound, totalFilesProcessed, elapsedMs, estimatedRemainingMs ->
                // Update UI progress
            },
            fileProcessor = { filePath, sha256, size, category ->
                // Process each file
                true
            }
        )

        setContent {
            MainScreen()
        }

        // Request storage permissions
        if (!permissionsRequested) {
            requestPermissions(
                arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE),
                1001
            )
            permissionsRequested = true
        }
    }

    @Composable
    fun MainScreen() {
        val context = LocalContext.current
        val showScaffold = remember { mutableStateOf(true) }

        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(text = "File DNA") },
                    supportingIcon = {
                        Button(onClick = { /* scan action */ }) {
                            Text("Scan")
                        }
                    },
                    actions = {
                        Button(onClick = { /* settings */ }) {
                            Text("Settings")
                        }
                    }
                )
            }
        ) {
            // Main content with navigation tabs
            val selectedNavItem = remember { mutableStateOf(NavItem.Dashboard) }
            NavHost(
                startDestination = NavItem.Dashboard.route,
                modifier = Modifier.fillMaxSize()
            ) {
                composable(NavItem.Dashboard.route) {
                    DashboardScreen(scanEngine = scanEngine)
                }
                composable(NavItem.Scan.route) {
                    ScanScreen(scanEngine = scanEngine, onFileSelected = { file ->
                        // Handle file selection
                    })
                }
                composable(NavItem.DNA_Inspector.route) {
                    DNAInspectorScreen()
                }
                composable(NavItem.Duplicates.route) {
                    DuplicatesScreen(scanEngine = scanEngine)
                }
                composable(NavItem.Reports.route) {
                    ReportsScreen()
                }
                composable(NavItem.Settings.route) {
                    SettingsScreen()
                }
            }
        }
    }
}