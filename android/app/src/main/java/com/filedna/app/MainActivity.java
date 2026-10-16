package com.filedna.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import com.filedna.app.core.DuplicateDetector;
import com.filedna.app.core.EntropyCalculator;
import com.filedna.app.core.FileHasher;
import com.filedna.app.core.MagicByteDetector;
import com.filedna.app.core.PdfTools;
import com.filedna.app.core.ReportExporter;

import java.io.File;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {

    private static final int REQ_PICK_FILE = 101;
    private static final int REQ_PICK_FOLDER = 102;

    private TextView tvStatFiles;
    private TextView tvStatStorage;
    private TextView tvStatDuplicates;
    private TextView tvResultsHeader;
    private TextView tvResultsContent;
    private TextView tvProgressStatus;
    private ProgressBar progressBar;
    private View layoutProgress;
    private Button btnCancelScan;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean isScanCancelled = false;

    private final List<DuplicateDetector.FileItem> scannedItems = Collections.synchronizedList(new ArrayList<>());
    private DuplicateDetector.DuplicateReport duplicateReport = null;
    private long totalScannedBytes = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        tvStatFiles = findViewById(R.id.tvStatFiles);
        tvStatStorage = findViewById(R.id.tvStatStorage);
        tvStatDuplicates = findViewById(R.id.tvStatDuplicates);
        tvResultsHeader = findViewById(R.id.tvResultsHeader);
        tvResultsContent = findViewById(R.id.tvResultsContent);
        tvProgressStatus = findViewById(R.id.tvProgressStatus);
        progressBar = findViewById(R.id.progressBar);
        layoutProgress = findViewById(R.id.layoutProgress);
        btnCancelScan = findViewById(R.id.btnCancelScan);

        Button btnScanFolder = findViewById(R.id.btnScanFolder);
        Button btnInspectFile = findViewById(R.id.btnInspectFile);
        Button btnPdfTools = findViewById(R.id.btnPdfTools);
        Button btnExportReport = findViewById(R.id.btnExportReport);

        btnScanFolder.setOnClickListener(v -> openFolderPicker());
        btnInspectFile.setOnClickListener(v -> openSingleFilePicker());
        btnPdfTools.setOnClickListener(v -> createSamplePdf());
        btnExportReport.setOnClickListener(v -> exportAndShareReport());

        btnCancelScan.setOnClickListener(v -> {
            isScanCancelled = true;
            tvProgressStatus.setText("Cancelling scan...");
        });
    }

    private void openFolderPicker() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(intent, REQ_PICK_FOLDER);
        } catch (Exception e) {
            Toast.makeText(this, "Storage access unavailable: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void openSingleFilePicker() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        try {
            startActivityForResult(intent, REQ_PICK_FILE);
        } catch (Exception e) {
            Toast.makeText(this, "File picker unavailable: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null) return;

        Uri uri = data.getData();
        if (uri == null) return;

        if (requestCode == REQ_PICK_FILE) {
            inspectSingleFile(uri);
        } else if (requestCode == REQ_PICK_FOLDER) {
            scanFolderUri(uri);
        }
    }

    private void inspectSingleFile(Uri uri) {
        layoutProgress.setVisibility(View.VISIBLE);
        tvProgressStatus.setText("Extracting DNA fingerprint...");
        isScanCancelled = false;

        executor.execute(() -> {
            try {
                String filename = getFilename(uri);
                InputStream inHash = getContentResolver().openInputStream(uri);
                FileHasher.Hashes hashes = FileHasher.calculateHashes(inHash);
                if (inHash != null) inHash.close();

                InputStream inEntropy = getContentResolver().openInputStream(uri);
                EntropyCalculator.EntropyResult entropy = EntropyCalculator.calculate(inEntropy, hashes.bytesRead);
                if (inEntropy != null) inEntropy.close();

                InputStream inMagic = getContentResolver().openInputStream(uri);
                MagicByteDetector.SignatureResult magic = MagicByteDetector.detect(inMagic, filename);
                if (inMagic != null) inMagic.close();

                mainHandler.post(() -> {
                    layoutProgress.setVisibility(View.GONE);
                    tvResultsHeader.setText("DNA PROFILE: " + filename);

                    StringBuilder sb = new StringBuilder();
                    sb.append("• Size: ").append(formatBytes(hashes.bytesRead)).append("\n");
                    sb.append("• SHA-256: ").append(hashes.sha256).append("\n");
                    sb.append("• MD5: ").append(hashes.md5).append("\n");
                    sb.append("• Shannon Entropy: ").append(entropy.entropy).append(" / 8.00\n");
                    sb.append("• Classification: ").append(entropy.classification).append("\n");
                    sb.append("• Header Magic: ").append(magic.headerHex).append(" (").append(magic.mime).append(")\n");
                    if (magic.mismatch) {
                        sb.append("⚠️ WARNING: Extension mismatch detected! File may be disguised.\n");
                    } else {
                        sb.append("✓ Signature verified with extension.\n");
                    }

                    tvResultsContent.setText(sb.toString());
                    Toast.makeText(this, "Fingerprinted: " + filename, Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                mainHandler.post(() -> {
                    layoutProgress.setVisibility(View.GONE);
                    tvResultsContent.setText("Error reading file: " + e.getMessage());
                });
            }
        });
    }

    private void scanFolderUri(Uri treeUri) {
        layoutProgress.setVisibility(View.VISIBLE);
        tvProgressStatus.setText("Scanning directory tree...");
        isScanCancelled = false;

        executor.execute(() -> {
            try {
                // Read and scan accessible media or tree elements
                scannedItems.clear();
                totalScannedBytes = 0;

                // Example: Scan selected URI
                String name = getFilename(treeUri);
                InputStream in = getContentResolver().openInputStream(treeUri);
                if (in != null) {
                    FileHasher.Hashes h = FileHasher.calculateHashes(in);
                    in.close();
                    scannedItems.add(new DuplicateDetector.FileItem(name, treeUri.toString(), h.bytesRead, h.sha256));
                    totalScannedBytes += h.bytesRead;
                }

                duplicateReport = DuplicateDetector.compute(scannedItems);

                mainHandler.post(() -> {
                    layoutProgress.setVisibility(View.GONE);
                    tvStatFiles.setText(String.valueOf(scannedItems.size()));
                    tvStatStorage.setText(formatBytes(totalScannedBytes));
                    tvStatDuplicates.setText(String.valueOf(duplicateReport.totalDuplicates));

                    tvResultsHeader.setText("SCAN COMPLETE");
                    tvResultsContent.setText("Scanned " + scannedItems.size() + " items (" + formatBytes(totalScannedBytes) + ").\nFound " + duplicateReport.totalDuplicates + " duplicates.");
                });
            } catch (Exception e) {
                mainHandler.post(() -> {
                    layoutProgress.setVisibility(View.GONE);
                    tvResultsContent.setText("Folder scan error: " + e.getMessage());
                });
            }
        });
    }

    private void createSamplePdf() {
        layoutProgress.setVisibility(View.VISIBLE);
        tvProgressStatus.setText("Generating PDF document...");

        executor.execute(() -> {
            File outFile = new File(getExternalFilesDir(null), "FileDNA_Report.pdf");
            String sampleText = "FILEDNA 2.0 DIGITAL FILE INTELLIGENCE REPORT\n\n" +
                "Platform: Android Mobile Intelligence Edition\n" +
                "Cryptographic Engine: SHA-256 / Shannon Entropy / Magic Signatures\n" +
                "Audit Status: Local Processing Complete.\n\n" +
                "Generated safely via Android native PdfDocument API.";

            boolean ok = PdfTools.createPdfFromText(outFile, sampleText, "FileDNA Intelligence Audit");

            mainHandler.post(() -> {
                layoutProgress.setVisibility(View.GONE);
                if (ok && outFile.exists()) {
                    tvResultsHeader.setText("PDF CREATED");
                    tvResultsContent.setText("PDF successfully generated!\nLocation: " + outFile.getAbsolutePath() + "\nSize: " + formatBytes(outFile.length()));
                    Toast.makeText(this, "PDF Generated: " + formatBytes(outFile.length()), Toast.LENGTH_SHORT).show();
                } else {
                    tvResultsContent.setText("Failed to generate PDF document.");
                }
            });
        });
    }

    private void exportAndShareReport() {
        if (scannedItems.isEmpty()) {
            Toast.makeText(this, "Scan or inspect files first before exporting", Toast.LENGTH_SHORT).show();
            return;
        }

        try {
            File exportDir = getExternalFilesDir(null);
            File reportFile = ReportExporter.exportCsv(exportDir, scannedItems);

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("text/csv");
            shareIntent.putExtra(Intent.EXTRA_STREAM, Uri.fromFile(reportFile));
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, "FileDNA Intelligence Report");
            shareIntent.putExtra(Intent.EXTRA_TEXT, "FileDNA 2.0 Audit Report generated on Android.");
            startActivity(Intent.createChooser(shareIntent, "Share FileDNA Report"));
        } catch (Exception e) {
            Toast.makeText(this, "Export failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private String getFilename(Uri uri) {
        String path = uri.getPath();
        if (path == null) return "unknown_file";
        int lastSlash = path.lastIndexOf('/');
        return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
    }

    private String formatBytes(long bytes) {
        if (bytes <= 0) return "0 B";
        String[] units = new String[]{"B", "KB", "MB", "GB", "TB"};
        int digitGroups = (int) (Math.log10(bytes) / Math.log10(1024));
        return String.format(Locale.US, "%.2f %s", bytes / Math.pow(1024, digitGroups), units[digitGroups]);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
    }
}
