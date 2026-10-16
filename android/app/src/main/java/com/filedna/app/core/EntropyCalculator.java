package com.filedna.app.core;

import java.io.InputStream;

public class EntropyCalculator {

    public static class EntropyResult {
        public final double entropy;
        public final String classification;
        public final int[] barcode;

        public EntropyResult(double entropy, String classification, int[] barcode) {
            this.entropy = entropy;
            this.classification = classification;
            this.barcode = barcode;
        }
    }

    public static EntropyResult calculate(InputStream in, long maxSample) {
        try {
            int sampleSize = (int) Math.min(maxSample > 0 ? maxSample : 2097152, 2097152); // Max 2MB sample
            byte[] buffer = new byte[sampleSize];
            int totalRead = 0;
            int read;
            while (totalRead < sampleSize && (read = in.read(buffer, totalRead, sampleSize - totalRead)) != -1) {
                totalRead += read;
            }

            if (totalRead == 0) {
                return new EntropyResult(0.0, "Empty File", new int[16]);
            }

            int[] freq = new int[256];
            for (int i = 0; i < totalRead; i++) {
                freq[buffer[i] & 0xFF]++;
            }

            double entropy = 0.0;
            for (int i = 0; i < 256; i++) {
                if (freq[i] > 0) {
                    double p = (double) freq[i] / totalRead;
                    entropy -= p * (Math.log(p) / Math.log(2.0));
                }
            }

            entropy = Math.round(entropy * 1000.0) / 1000.0;

            String classification;
            if (entropy == 0.0) {
                classification = "Zeroed / Sparse Padding";
            } else if (entropy < 3.5) {
                classification = "Plain Text / Structured Code";
            } else if (entropy < 5.5) {
                classification = "Formatted Document / Structured Data";
            } else if (entropy < 7.2) {
                classification = "Native Binary / Compiled Code";
            } else {
                classification = "High Entropy (Compressed / Encrypted)";
            }

            int[] barcode = new int[16];
            for (int b = 0; b < 16; b++) {
                int sum = 0;
                for (int i = 0; i < 16; i++) {
                    sum += freq[b * 16 + i];
                }
                barcode[b] = (int) Math.round(((double) sum / totalRead) * 100.0);
            }

            return new EntropyResult(entropy, classification, barcode);
        } catch (Exception e) {
            return new EntropyResult(0.0, "Analysis Error", new int[16]);
        }
    }
}
