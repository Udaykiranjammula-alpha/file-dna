package com.filedna.app.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DuplicateDetector {

    public static class FileItem {
        public final String name;
        public final String path;
        public final long size;
        public final String sha256;

        public FileItem(String name, String path, long size, String sha256) {
            this.name = name;
            this.path = path;
            this.size = size;
            this.sha256 = sha256;
        }
    }

    public static class DuplicateGroup {
        public final String sha256;
        public final long sizePerFile;
        public final long wastedBytes;
        public final List<FileItem> copies;

        public DuplicateGroup(String sha256, long sizePerFile, List<FileItem> copies) {
            this.sha256 = sha256;
            this.sizePerFile = sizePerFile;
            this.copies = copies;
            this.wastedBytes = (copies.size() - 1) * sizePerFile;
        }
    }

    public static class DuplicateReport {
        public final List<DuplicateGroup> groups;
        public final int totalDuplicates;
        public final long totalWastedBytes;

        public DuplicateReport(List<DuplicateGroup> groups, int totalDuplicates, long totalWastedBytes) {
            this.groups = groups;
            this.totalDuplicates = totalDuplicates;
            this.totalWastedBytes = totalWastedBytes;
        }
    }

    public static DuplicateReport compute(List<FileItem> files) {
        Map<String, List<FileItem>> hashMap = new HashMap<>();
        for (FileItem item : files) {
            if (item.sha256 == null || item.sha256.isEmpty()) continue;
            List<FileItem> group = hashMap.get(item.sha256);
            if (group == null) {
                group = new ArrayList<>();
                hashMap.put(item.sha256, group);
            }
            group.add(item);
        }

        List<DuplicateGroup> duplicates = new ArrayList<>();
        int dupCount = 0;
        long wastedBytes = 0;

        for (Map.Entry<String, List<FileItem>> entry : hashMap.entrySet()) {
            List<FileItem> group = entry.getValue();
            if (group.size() > 1) {
                DuplicateGroup dg = new DuplicateGroup(entry.getKey(), group.get(0).size, group);
                duplicates.add(dg);
                dupCount += (group.size() - 1);
                wastedBytes += dg.wastedBytes;
            }
        }

        return new DuplicateReport(duplicates, dupCount, wastedBytes);
    }
}
