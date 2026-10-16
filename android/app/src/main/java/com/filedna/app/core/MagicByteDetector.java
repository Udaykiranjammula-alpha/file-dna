package com.filedna.app.core;

import java.io.InputStream;
import java.util.Arrays;

public class MagicByteDetector {

    public static class SignatureResult {
        public final boolean detected;
        public final String mime;
        public final String expectedExt;
        public final String headerHex;
        public final boolean mismatch;

        public SignatureResult(boolean detected, String mime, String expectedExt, String headerHex, boolean mismatch) {
            this.detected = detected;
            this.mime = mime;
            this.expectedExt = expectedExt;
            this.headerHex = headerHex;
            this.mismatch = mismatch;
        }
    }

    private static class Sig {
        final byte[] magic;
        final String mime;
        final String ext;
        final int offset;

        Sig(int[] magicInts, String mime, String ext, int offset) {
            this.magic = new byte[magicInts.length];
            for (int i = 0; i < magicInts.length; i++) {
                this.magic[i] = (byte) magicInts[i];
            }
            this.mime = mime;
            this.ext = ext;
            this.offset = offset;
        }

        Sig(int[] magicInts, String mime, String ext) {
            this(magicInts, mime, ext, 0);
        }
    }

    private static final Sig[] SIGNATURES = new Sig[] {
        new Sig(new int[]{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, "image/png", ".png"),
        new Sig(new int[]{0xFF, 0xD8, 0xFF}, "image/jpeg", ".jpg"),
        new Sig(new int[]{0x47, 0x49, 0x46, 0x38}, "image/gif", ".gif"),
        new Sig(new int[]{0x25, 0x50, 0x44, 0x46}, "application/pdf", ".pdf"),
        new Sig(new int[]{0x50, 0x4B, 0x03, 0x04}, "application/zip", ".zip"),
        new Sig(new int[]{0x52, 0x61, 0x72, 0x21, 0x1A, 0x07}, "application/x-rar", ".rar"),
        new Sig(new int[]{0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C}, "application/x-7z", ".7z"),
        new Sig(new int[]{0x4D, 0x5A}, "application/x-dosexec", ".exe"),
        new Sig(new int[]{0x49, 0x44, 0x33}, "audio/mpeg", ".mp3"),
        new Sig(new int[]{0x52, 0x49, 0x46, 0x46}, "audio/wav", ".wav"),
        new Sig(new int[]{0x66, 0x74, 0x79, 0x70}, "video/mp4", ".mp4", 4),
        new Sig(new int[]{0x1F, 0x8B}, "application/gzip", ".gz")
    };

    public static SignatureResult detect(InputStream in, String actualFilename) {
        try {
            byte[] header = new byte[16];
            int read = in.read(header);
            if (read <= 0) {
                return new SignatureResult(false, "Unknown", "", "", false);
            }

            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < Math.min(read, 8); i++) {
                hex.append(String.format("%02X", header[i]));
            }

            String ext = "";
            int dot = actualFilename.lastIndexOf('.');
            if (dot >= 0) {
                ext = actualFilename.substring(dot).toLowerCase();
            }

            for (Sig s : SIGNATURES) {
                if (read >= s.offset + s.magic.length) {
                    boolean match = true;
                    for (int i = 0; i < s.magic.length; i++) {
                        if (header[s.offset + i] != s.magic[i]) {
                            match = false;
                            break;
                        }
                    }
                    if (match) {
                        boolean isZipCompatible = s.ext.equals(".zip") && 
                            (ext.equals(".zip") || ext.equals(".docx") || ext.equals(".xlsx") || 
                             ext.equals(".pptx") || ext.equals(".apk") || ext.equals(".jar"));
                        boolean isJpgCompatible = s.ext.equals(".jpg") && (ext.equals(".jpg") || ext.equals(".jpeg"));
                        boolean mismatch = !ext.equals(s.ext) && !isZipCompatible && !isJpgCompatible;
                        return new SignatureResult(true, s.mime, s.ext, hex.toString(), mismatch);
                    }
                }
            }

            return new SignatureResult(false, "Generic Binary / Text", "", hex.toString(), false);
        } catch (Exception e) {
            return new SignatureResult(false, "Unavailable", "", "", false);
        }
    }
}
