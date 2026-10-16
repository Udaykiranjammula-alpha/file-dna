package com.filedna.app.core;

import java.io.InputStream;
import java.security.MessageDigest;
import java.util.zip.CRC32;

public class FileHasher {

    public static class Hashes {
        public final String sha256;
        public final String md5;
        public final String sha1;
        public final String crc32;
        public final long bytesRead;

        public Hashes(String sha256, String md5, String sha1, String crc32, long bytesRead) {
            this.sha256 = sha256;
            this.md5 = md5;
            this.sha1 = sha1;
            this.crc32 = crc32;
            this.bytesRead = bytesRead;
        }
    }

    public static Hashes calculateHashes(InputStream in) throws Exception {
        MessageDigest sha256Digest = MessageDigest.getInstance("SHA-256");
        MessageDigest md5Digest = MessageDigest.getInstance("MD5");
        MessageDigest sha1Digest = MessageDigest.getInstance("SHA-1");
        CRC32 crc32 = new CRC32();

        byte[] buffer = new byte[16384]; // 16KB stream buffer
        int read;
        long totalBytes = 0;

        while ((read = in.read(buffer)) != -1) {
            sha256Digest.update(buffer, 0, read);
            md5Digest.update(buffer, 0, read);
            sha1Digest.update(buffer, 0, read);
            crc32.update(buffer, 0, read);
            totalBytes += read;
        }

        return new Hashes(
            bytesToHex(sha256Digest.digest()),
            bytesToHex(md5Digest.digest()),
            bytesToHex(sha1Digest.digest()),
            String.format("%08x", crc32.getValue()),
            totalBytes
        );
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
