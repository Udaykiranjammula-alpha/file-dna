# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| 1.0.x   | :white_check_mark: |

## Privacy and Local-First Architecture

FileDNA is designed from the ground up as a **100% offline, local-first file intelligence platform**:
- **Zero Cloud Uploads**: FileDNA never uploads file contents, filenames, metadata, or scan indexes to any cloud service or external API.
- **Static Inspection Only**: FileDNA only reads and inspects files statically using non-executing byte streams. It never executes or launches scanned binaries.
- **Path Traversal Protection**: Archive extractors explicitly validate relative file paths to protect against directory traversal (`../`) attacks.
- **Zip Bomb Defense**: Archive operations measure expansion ratios and alert when compression ratios exceed safe thresholds (100x).
- **Safe Recycling**: Potentially destructive operations (such as duplicate removal) utilize the Windows Recycle Bin API (`shell.trashItem`) or explicit confirmation, preventing permanent data loss.
- **Scoped Android Storage**: The Android application utilizes the Storage Access Framework (SAF) and scoped storage APIs, requesting only authorized permissions.

## Reporting a Vulnerability

If you discover a security vulnerability within FileDNA, please report it privately:

- **Contact**: `2500031243@kluniversity.in`
- **Architect**: Uday Kiran Jammula

Please include a detailed description of the vulnerability, reproduction steps, and platform environment (Windows or Android).
