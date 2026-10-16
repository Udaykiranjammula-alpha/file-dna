package com.filedna.app.core;

import java.io.File;
import java.io.FileWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class ReportExporter {

    public static File exportCsv(File destDir, List<DuplicateDetector.FileItem> items) throws Exception {
        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        File file = new File(destDir, "FileDNA_Report_" + timestamp + ".csv");
        FileWriter writer = new FileWriter(file);

        writer.write("# FileDNA 2.0 Mobile Intelligence Audit Report\n");
        writer.write("# Generated: " + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()) + "\n");
        writer.write("Filename,Size_Bytes,SHA256,Path\n");

        for (DuplicateDetector.FileItem item : items) {
            String name = (item.name != null ? item.name : "").replace("\"", "\"\"");
            String path = (item.path != null ? item.path : "").replace("\"", "\"\"");
            writer.write(String.format(Locale.US, "\"%s\",%d,\"%s\",\"%s\"\n", name, item.size, item.sha256, path));
        }

        writer.flush();
        writer.close();
        return file;
    }

    public static File exportJson(File destDir, List<DuplicateDetector.FileItem> items, DuplicateDetector.DuplicateReport dups) throws Exception {
        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        File file = new File(destDir, "FileDNA_Report_" + timestamp + ".json");
        FileWriter writer = new FileWriter(file);

        StringBuilder sb = new StringBuilder();
        sb.append("{\n");
        sb.append("  \"software\": \"FileDNA Mobile\",\n");
        sb.append("  \"version\": \"2.0.0\",\n");
        sb.append("  \"generatedAt\": \"").append(new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(new Date())).append("\",\n");
        sb.append("  \"summary\": {\n");
        sb.append("    \"totalFiles\": ").append(items.size()).append(",\n");
        sb.append("    \"duplicateCount\": ").append(dups != null ? dups.totalDuplicates : 0).append(",\n");
        sb.append("    \"wastedBytes\": ").append(dups != null ? dups.totalWastedBytes : 0).append("\n");
        sb.append("  },\n");
        sb.append("  \"files\": [\n");

        for (int i = 0; i < items.size(); i++) {
            DuplicateDetector.FileItem item = items.get(i);
            sb.append("    {\n");
            sb.append("      \"name\": \"").append(escapeJson(item.name)).append("\",\n");
            sb.append("      \"size\": ").append(item.size).append(",\n");
            sb.append("      \"sha256\": \"").append(item.sha256).append("\",\n");
            sb.append("      \"path\": \"").append(escapeJson(item.path)).append("\"\n");
            sb.append("    }").append(i < items.size() - 1 ? "," : "").append("\n");
        }

        sb.append("  ]\n");
        sb.append("}\n");

        writer.write(sb.toString());
        writer.flush();
        writer.close();
        return file;
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "");
    }
}
