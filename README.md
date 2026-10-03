<div align="center">

<img src="assets/banner.png" alt="File DNA Banner" width="100%" style="border-radius: 12px; margin-bottom: 20px;" />

# FILE DNA
### Advanced Forensic File Intelligence & Deduplication Suite for Windows

[![Version](https://img.shields.io/badge/version-1.0.0-white?style=for-the-badge&logo=semver&logoColor=white&color=18181b)](https://github.com/Udaykiranjammula-alpha/file-dna/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-white?style=for-the-badge&logo=windows&logoColor=white&color=18181b)](https://github.com/Udaykiranjammula-alpha/file-dna/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-white?style=for-the-badge&color=18181b)](LICENSE)
[![Architect](https://img.shields.io/badge/Architect-Uday%20Kiran%20Jammula-white?style=for-the-badge&logo=github&logoColor=white&color=18181b)](https://github.com/Udaykiranjammula-alpha)

<p align="center">
  <strong>File DNA</strong> is a high-performance Windows desktop application designed to extract the cryptographic, forensic, and structural identity of any file. Built with a pure matte obsidian minimalist interface, it combines streaming cryptographic hashing, Shannon entropy profiling, and byte-level duplicate eradication.
</p>

---

### ⚡ [Direct Downloads](https://github.com/Udaykiranjammula-alpha/file-dna/releases/latest)

| Edition | Description | Download Link |
| :--- | :--- | :--- |
| **Portable (.exe)** | Standalone single-file executable. Runs instantly without installation. | [⬇️ Download Portable EXE](https://github.com/Udaykiranjammula-alpha/file-dna/releases/download/v1.0.0/File-DNA-Portable-1.0.0.exe) |
| **Windows Installer** | Full NSIS Windows setup wizard with Start Menu & Desktop shortcuts. | [⬇️ Download Windows Setup](https://github.com/Udaykiranjammula-alpha/file-dna/releases/download/v1.0.0/File.DNA-Setup-1.0.0.exe) |

</div>

---

## 🧬 Forensic Capabilities

### 1. Dual-Stream Cryptographic Signatures
File DNA calculates both **SHA-256** and **MD5** content hashes concurrently in a single non-blocking stream. These deterministic hashes guarantee exact byte-level integrity verification across your system.

### 2. Shannon Entropy Profiling
Analyzes the mathematical randomness of byte values ($0.0$ to $8.0$ bits/byte) using the Shannon formula:
$$H(X) = -\sum_{i=0}^{255} P(x_i) \log_2 P(x_i)$$
- **$0.0 - 1.0$ bits/byte**: Zeroed or sparse padding.
- **$1.0 - 3.5$ bits/byte**: Plain text, Markdown, scripts, and structured source code.
- **$3.5 - 5.5$ bits/byte**: Formatted office documents, XML, JSON, and structured database records.
- **$5.5 - 7.2$ bits/byte**: Native Windows PE binaries, DLLs, and uncompressed media.
- **$7.2 - 8.0$ bits/byte**: High entropy, packed, encrypted, or compressed archives.

### 3. 16-Bucket Byte Density Barcode
Visualizes the binary frequency spectrum across 16 discrete byte intervals ($0\text{x}00$ through $0\text{xFF}$), rendering an instant visual barcode representation of the file's inner structure.

### 4. Duplicate Content Vault & Space Reclamation
Identifies byte-for-byte identical duplicates regardless of file name or directory location. Calculates total recoverable disk space and provides safe one-click dispatch to the **Windows Recycle Bin** via the Windows Shell API.

### 5. Magic Byte Header Extraction
Inspects low-level header signatures to detect real file formats (e.g. `MZ` PE binaries, `PK` Zip/Office, `%PDF`, `89PNG`, `FFD8FF` JPEG), exposing misleading file extensions.

---

## 🖤 Minimalist Natural Design

- **Matte Obsidian Palette**: Engineered with a pure dark aesthetic (`#000000` / `#08080a`), ultra-fine hairline dividers, and muted monochrome contrast.
- **Global Drag & Drop Overlay**: Drag files or complete nested directory structures directly into the application window from Windows File Explorer.
- **Dynamic Category Meters**: Live visual breakdown of scanned storage across Documents, Media, Code, Archives, Data, and Executables.
- **Instant Search & Registry Filter**: Real-time filtering by file name, extension, SHA-256 hash, or category.
- **Intelligence Export**: One-click generation of audit reports in standard JSON or CSV format.

---

## 🚀 Getting Started

### Option A: Run the Precompiled Binary
1. Download **`File-DNA-Portable-1.0.0.exe`** from [Releases](https://github.com/Udaykiranjammula-alpha/file-dna/releases/latest).
2. Double-click to launch. No runtime or installation required.

### Option B: Build from Source

#### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- [npm](https://www.npmjs.com/) v9.0.0 or higher
- Windows 10 or 11 (64-bit)

#### Installation
```bash
# 1. Clone the repository
git clone https://github.com/Udaykiranjammula-alpha/file-dna.git
cd file-dna

# 2. Install dependencies
npm install

# 3. Launch in development mode
npm start
```

#### Package into Standalone Executables
```bash
# Build Portable Executable (.exe)
npm run dist:portable

# Build NSIS Windows Installer (.exe)
npm run dist:nsis

# Build Both
npm run dist
```
Compiled binaries will be generated inside the `release/` directory.

---

## 🏗️ Project Architecture

```
file-dna/
├── .github/
│   ├── workflows/
│   │   └── release.yml          # Automated CI/CD release builder
│   └── ISSUE_TEMPLATE/          # Structured issue templates
├── assets/
│   ├── icon.ico                 # Multi-resolution Windows app icon
│   ├── icon.png                 # 256x256 high-resolution icon
│   └── banner.png               # Repository banner
├── electron/
│   ├── main.js                  # Main process: Forensic engine & IPC handlers
│   └── preload.js               # Context bridge (window.fileDNA)
├── renderer/
│   ├── index.html               # Matte black user interface
│   ├── css/
│   │   └── styles.css           # Natural black design system
│   └── js/
│       └── app.js               # Frontend controller & visualizations
├── .gitignore                   # Ignored files & build caches
├── LICENSE                      # MIT Open Source License
├── package.json                 # Project configuration & scripts
└── README.md                    # Project documentation
```

---

## 🛡️ License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for complete terms.

---

## 👤 Author & Architecture

**Uday Kiran Jammula**  
GitHub: [@Udaykiranjammula-alpha](https://github.com/Udaykiranjammula-alpha)  
Email: `2500031243@kluniversity.in`
