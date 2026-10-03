# Changelog

All notable changes to **File DNA** are documented in this file.

## [1.0.0] - 2026-10-03
### Added
- **Initial Public Release** by **Uday Kiran Jammula**.
- **Forensic DNA Engine**:
  - High-performance streaming SHA-256 and MD5 cryptographic checksum generation.
  - Shannon Entropy calculation ($0.0$ to $8.0$ bits/byte) to identify zeroed/sparse data, plain text, native executables, or compressed/encrypted payloads.
  - 16-bucket byte density spectrum barcode visualization.
  - Magic byte header detection for popular formats (PNG, JPG, PDF, ZIP, PE Executable, etc.).
- **Natural Black Minimalist UI**:
  - Matte obsidian black aesthetic with refined monochrome typography.
  - Global drag-and-drop overlay for instant file and folder analysis.
  - Real-time Dashboard with category storage breakdown and recent scan history.
  - Dedicated Duplicate Content Vault with byte-for-byte duplicate grouping and wasted storage calculator.
  - Searchable File Registry with category filtering and instant explorer reveals.
  - Export capabilities for forensic intelligence reports (JSON and CSV).
- **Windows Standalone Packaging**:
  - Portable single-executable build (`File-DNA-Portable-1.0.0.exe`).
  - Full NSIS installer with desktop shortcuts (`File DNA-Setup-1.0.0.exe`).
  - Automated GitHub Actions release pipeline.
