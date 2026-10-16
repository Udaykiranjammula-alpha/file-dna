const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CRC32 = require('crc-32');

/**
 * Advanced Forensic Engine for FileDNA
 * Provides file analysis, entropy calculation, magic byte detection, and mismatch checking.
 */
class ForensicEngine {
  constructor() {
    // Extensive magic bytes database for forensic identification
    this.MAGIC_SIGNATURES = [
      // Images
      { sig: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], ext: '.png', mime: 'image/png', type: 'image' },
      { sig: [0xFF, 0xD8, 0xFF], ext: '.jpg', mime: 'image/jpeg', type: 'image' },
      { sig: [0x47, 0x49, 0x46, 0x38], ext: '.gif', mime: 'image/gif', type: 'image' },
      { sig: [0x42, 0x4D], ext: '.bmp', mime: 'image/bmp', type: 'image' },
      { sig: [0x49, 0x49, 0x2A, 0x00], ext: '.tiff', mime: 'image/tiff', type: 'image' },
      { sig: [0x4D, 0x4D, 0x00, 0x2A], ext: '.tiff', mime: 'image/tiff', type: 'image' },
      { sig: [0x52, 0x49, 0x46, 0x46], offset: 0, ext: '.webp', mime: 'image/webp', type: 'image', match: (buf) => buf.length >= 12 && buf.toString('ascii', 8, 4) === 'WEBP' },
      { sig: [0x00, 0x00, 0x01, 0x00], ext: '.ico', mime: 'image/x-icon', type: 'image' },
      { sig: [0x38, 0x42, 0x50, 0x53], ext: '.psd', mime: 'image/vnd.adobe.photoshop', type: 'image' },
      
      // Documents
      { sig: [0x25, 0x50, 0x44, 0x46, 0x2D], ext: '.pdf', mime: 'application/pdf', type: 'document' },
      { sig: [0x7B, 0x5C, 0x72, 0x74, 0x66, 0x31], ext: '.rtf', mime: 'application/rtf', type: 'document' },
      { sig: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], ext: '.doc', mime: 'application/msword', type: 'document' }, // OLECF (legacy office)
      
      // Archives & Office Documents (PK)
      { sig: [0x50, 0x4B, 0x03, 0x04], ext: '.zip', mime: 'application/zip', type: 'archive' },
      { sig: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], ext: '.rar', mime: 'application/x-rar-compressed', type: 'archive' },
      { sig: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], ext: '.7z', mime: 'application/x-7z-compressed', type: 'archive' },
      { sig: [0x1F, 0x8B], ext: '.gz', mime: 'application/gzip', type: 'archive' },
      { sig: [0x75, 0x73, 0x74, 0x61, 0x72], offset: 257, ext: '.tar', mime: 'application/x-tar', type: 'archive' },
      { sig: [0x42, 0x5A, 0x68], ext: '.bz2', mime: 'application/x-bzip2', type: 'archive' },
      { sig: [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00], ext: '.xz', mime: 'application/x-xz', type: 'archive' },
      { sig: [0x28, 0xB5, 0x2F, 0xFD], ext: '.zst', mime: 'application/zstd', type: 'archive' },
      
      // Audio
      { sig: [0x49, 0x44, 0x33], ext: '.mp3', mime: 'audio/mpeg', type: 'audio' },
      { sig: [0xFF, 0xFB], ext: '.mp3', mime: 'audio/mpeg', type: 'audio' },
      { sig: [0x52, 0x49, 0x46, 0x46], offset: 0, ext: '.wav', mime: 'audio/wav', type: 'audio', match: (buf) => buf.length >= 12 && buf.toString('ascii', 8, 4) === 'WAVE' },
      { sig: [0x66, 0x4C, 0x61, 0x43], ext: '.flac', mime: 'audio/flac', type: 'audio' },
      { sig: [0x4F, 0x67, 0x67, 0x53], ext: '.ogg', mime: 'audio/ogg', type: 'audio' },
      { sig: [0xFF, 0xF1], ext: '.aac', mime: 'audio/aac', type: 'audio' },
      { sig: [0xFF, 0xF9], ext: '.aac', mime: 'audio/aac', type: 'audio' },
    
      // Video
      { sig: [0x66, 0x74, 0x79, 0x70], offset: 4, ext: '.mp4', mime: 'video/mp4', type: 'video' },
      { sig: [0x52, 0x49, 0x46, 0x46], offset: 0, ext: '.avi', mime: 'video/x-msvideo', type: 'video', match: (buf) => buf.length >= 12 && buf.toString('ascii', 8, 4) === 'AVI ' },
      { sig: [0x1A, 0x45, 0xDF, 0xA3], ext: '.mkv', mime: 'video/x-matroska', type: 'video' },
      { sig: [0x46, 0x4C, 0x56, 0x01], ext: '.flv', mime: 'video/x-flv', type: 'video' },
      
      // Executables
      { sig: [0x4D, 0x5A], ext: '.exe', mime: 'application/x-msdownload', type: 'executable' },
      { sig: [0x7F, 0x45, 0x4C, 0x46], ext: '.elf', mime: 'application/x-executable', type: 'executable' },
      { sig: [0xFE, 0xED, 0xFA, 0xCE], ext: '.macho', mime: 'application/x-mach-binary', type: 'executable' },
      { sig: [0xFE, 0xED, 0xFA, 0xCF], ext: '.macho', mime: 'application/x-mach-binary', type: 'executable' },
      { sig: [0xCF, 0xFA, 0xED, 0xFE], ext: '.macho', mime: 'application/x-mach-binary', type: 'executable' },
      { sig: [0xCE, 0xFA, 0xED, 0xFE], ext: '.macho', mime: 'application/x-mach-binary', type: 'executable' },
      { sig: [0xCA, 0xFE, 0xBA, 0xBE], ext: '.class', mime: 'application/java-vm', type: 'executable' },
      
      // Databases & Other
      { sig: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00], ext: '.sqlite', mime: 'application/vnd.sqlite3', type: 'database' },
      { sig: [0x00, 0x61, 0x73, 0x6D], ext: '.wasm', mime: 'application/wasm', type: 'executable' },
      { sig: [0xD4, 0xC3, 0xB2, 0xA1], ext: '.pcap', mime: 'application/vnd.tcpdump.pcap', type: 'other' },
      { sig: [0xA1, 0xB2, 0xC3, 0xD4], ext: '.pcap', mime: 'application/vnd.tcpdump.pcap', type: 'other' }
    ];
  }

  /**
   * 1. Hash Calculation (streaming, never loads full file)
   * Calculates SHA256, MD5, SHA1, and CRC32 concurrently.
   * @param {string} filePath - Absolute path to the file.
   * @returns {Promise<{sha256: string, md5: string, sha1: string, crc32: string}>}
   */
  calculateHashes(filePath) {
    return new Promise((resolve, reject) => {
      const sha256 = crypto.createHash('sha256');
      const md5 = crypto.createHash('md5');
      const sha1 = crypto.createHash('sha1');
      let crc32Val = 0;

      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => {
        sha256.update(chunk);
        md5.update(chunk);
        sha1.update(chunk);
        crc32Val = CRC32.buf(chunk, crc32Val);
      });

      stream.on('end', () => {
        resolve({
          sha256: sha256.digest('hex'),
          md5: md5.digest('hex'),
          sha1: sha1.digest('hex'),
          crc32: (crc32Val >>> 0).toString(16).padStart(8, '0') // Ensure unsigned hex string
        });
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * 2. Hash Verification
   * @param {string} filePath - Absolute path to the file.
   * @param {string} expectedHash - The expected hash string.
   * @param {string} algorithm - Hash algorithm to check against.
   * @returns {Promise<{match: boolean, computed: string, expected: string, algorithm: string}>}
   */
  async verifyHash(filePath, expectedHash, algorithm = 'sha256') {
    const hashes = await this.calculateHashes(filePath);
    const computed = hashes[algorithm] || '';
    return {
      match: computed.toLowerCase() === expectedHash.toLowerCase(),
      computed,
      expected: expectedHash,
      algorithm
    };
  }

  /**
   * 3. Enhanced Magic Byte Detection
   * Identifies file types by analyzing file headers against known magic bytes.
   * @param {string} filePath - Absolute path to the file.
   * @returns {Promise<Object>} Detection result object.
   */
  async detectMagic(filePath) {
    const CHUNK_SIZE = 512;
    const buf = Buffer.alloc(CHUNK_SIZE);

    try {
      const fileHandle = await fs.promises.open(filePath, 'r');
      const { bytesRead } = await fileHandle.read(buf, 0, CHUNK_SIZE, 0);
      await fileHandle.close();

      if (bytesRead === 0) {
        return { detected: false, expectedExt: '', headerHex: '', headerBytes: [], reason: 'empty file' };
      }

      const headerBytes = Array.from(buf.subarray(0, Math.min(bytesRead, 16)));
      const headerHex = headerBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');

      for (const sigInfo of this.MAGIC_SIGNATURES) {
        const offset = sigInfo.offset || 0;
        const sigLen = sigInfo.sig.length;

        if (bytesRead < offset + sigLen) continue;

        let match = true;
        for (let i = 0; i < sigLen; i++) {
          if (buf[offset + i] !== sigInfo.sig[i]) {
            match = false;
            break;
          }
        }

        if (match && typeof sigInfo.match === 'function') {
          match = sigInfo.match(buf);
        }

        if (match) {
          return {
            detected: true,
            signature: sigInfo.mime,
            expectedExt: sigInfo.ext,
            type: sigInfo.type,
            headerHex,
            headerBytes
          };
        }
      }

      return {
        detected: false,
        expectedExt: '',
        headerHex,
        headerBytes,
        reason: 'unknown signature'
      };
    } catch (err) {
      return { detected: false, error: err.message, expectedExt: '', headerHex: '', headerBytes: [] };
    }
  }

  /**
   * Alias for detectMagic for backward compatibility
   */
  inspectMagicBytes(filePath) {
    return this.detectMagic(filePath);
  }

  /**
   * 4. Extension Mismatch Detection
   * Compares the actual file extension against the expected extension derived from magic bytes.
   * @param {string} filePath - Absolute path to the file.
   * @param {Object} magicResult - The result from detectMagic().
   * @returns {Object} Mismatch details.
   */
  detectMismatch(filePath, magicResult) {
    const actualExt = path.extname(filePath).toLowerCase();
    
    if (!magicResult.detected) {
      return { mismatch: false, actualExt, expectedExt: '', severity: 'info', message: 'Unknown file signature, cannot verify extension' };
    }

    const expectedExt = magicResult.expectedExt;

    // Specific compatibility map where different extensions are valid for the same container format
    const compatibleMap = {
      '.zip': ['.zip', '.docx', '.xlsx', '.pptx', '.jar', '.apk', '.epub', '.cbz'],
      '.mp4': ['.mp4', '.m4a', '.m4v', '.mov'],
      '.tiff': ['.tiff', '.tif'],
      '.jpg': ['.jpg', '.jpeg', '.jpe'],
      '.exe': ['.exe', '.dll', '.sys', '.scr']
    };

    let isMatch = actualExt === expectedExt;
    
    // Check compatibility map
    if (!isMatch && compatibleMap[expectedExt] && compatibleMap[expectedExt].includes(actualExt)) {
      isMatch = true;
    }

    if (isMatch) {
      return { mismatch: false, actualExt, expectedExt, severity: 'info', message: 'Extension matches file signature' };
    }

    // Determine severity
    let severity = 'warning';
    let message = `Extension mismatch: File is actually ${expectedExt} but has ${actualExt} extension.`;

    // Critical check: Executable pretending to be an image, document, etc.
    if (magicResult.type === 'executable' && !compatibleMap['.exe'].includes(actualExt)) {
      severity = 'critical';
      message = `CRITICAL: Executable file disguised as ${actualExt === '' ? 'extensionless file' : actualExt}`;
    }

    return {
      mismatch: true,
      actualExt,
      expectedExt,
      severity,
      message
    };
  }

  /**
   * 5. Hex Viewer Data
   * Reads a chunk of the file and formats it into a standard hex dump layout.
   * @param {string} filePath - Absolute path to the file.
   * @param {number} offset - Byte offset to start reading from.
   * @param {number} length - Number of bytes to read.
   * @returns {Promise<{hex: string, raw: Buffer, totalFileSize: number}>}
   */
  async getHexDump(filePath, offset = 0, length = 512) {
    try {
      const stats = await fs.promises.stat(filePath);
      const totalFileSize = stats.size;
      
      const buf = Buffer.alloc(Math.min(length, Math.max(0, totalFileSize - offset)));
      if (buf.length > 0) {
        const fileHandle = await fs.promises.open(filePath, 'r');
        await fileHandle.read(buf, 0, buf.length, offset);
        await fileHandle.close();
      }

      let hexOutput = '';
      for (let i = 0; i < buf.length; i += 16) {
        const chunk = buf.subarray(i, i + 16);
        const hexStr = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
        
        let asciiStr = '';
        for (const b of chunk) {
          asciiStr += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        }
        
        const lineOffset = (offset + i).toString(16).padStart(8, '0');
        hexOutput += `${lineOffset} | ${hexStr.padEnd(47, ' ')} | ${asciiStr}\n`;
      }

      return {
        hex: hexOutput,
        raw: buf,
        totalFileSize
      };
    } catch (err) {
      throw new Error(`Failed to generate hex dump: ${err.message}`);
    }
  }

  /**
   * 6. Text Preview
   * Attempts to read file as text and determine if it is predominantly valid UTF-8/ASCII.
   * @param {string} filePath - Absolute path to the file.
   * @param {number} maxBytes - Max bytes to read for preview.
   * @returns {Promise<{isText: boolean, encoding: string, content: string, truncated: boolean}>}
   */
  async getTextPreview(filePath, maxBytes = 4096) {
    try {
      const stats = await fs.promises.stat(filePath);
      const readLength = Math.min(stats.size, maxBytes);
      const buf = Buffer.alloc(readLength);
      
      const fileHandle = await fs.promises.open(filePath, 'r');
      await fileHandle.read(buf, 0, readLength, 0);
      await fileHandle.close();

      // Heuristic for text: check for non-printable characters (excluding common whitespace)
      let nonPrintable = 0;
      for (let i = 0; i < buf.length; i++) {
        const char = buf[i];
        if (char < 32 && char !== 9 && char !== 10 && char !== 13) {
          nonPrintable++;
        }
      }

      // If more than 5% of characters are non-printable, it's likely binary
      const isText = (nonPrintable / buf.length) < 0.05;
      
      if (!isText) {
        return {
          isText: false,
          encoding: 'binary',
          content: '',
          truncated: false
        };
      }

      // Fallback: mostly printable characters.
      return {
        isText: true,
        encoding: 'utf-8',
        content: buf.toString('utf-8'),
        truncated: stats.size > maxBytes
      };
    } catch (err) {
      throw new Error(`Failed to generate text preview: ${err.message}`);
    }
  }

  /**
   * Standalone Shannon Entropy Calculation with 16-bucket Barcode
   * @param {string} filePath - Absolute path to the file.
   * @returns {Promise<{entropy: number, barcode: number[], classification: string}>}
   */
  calculateForensicEntropy(filePath) {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      const counts = new Array(256).fill(0);
      let totalBytes = 0;
      const bucketSize = 16;
      const barcode = new Array(16).fill(0);

      stream.on('data', (chunk) => {
        totalBytes += chunk.length;
        for (let i = 0; i < chunk.length; i++) {
          counts[chunk[i]]++;
        }
      });

      stream.on('end', () => {
        if (totalBytes === 0) {
          return resolve({ entropy: 0, barcode, classification: 'Empty File' });
        }
        
        let entropy = 0;
        for (let i = 0; i < 256; i++) {
          if (counts[i] > 0) {
            const p = counts[i] / totalBytes;
            entropy -= p * Math.log2(p);
          }
          barcode[Math.floor(i / bucketSize)] += counts[i];
        }
        
        // Normalize barcode
        const maxBucket = Math.max(...barcode);
        const normalizedBarcode = maxBucket > 0 ? barcode.map(v => Math.round((v / maxBucket) * 15)) : barcode;
        
        let classification = 'Standard';
        if (entropy > 7.5) classification = 'Encrypted/Compressed';
        else if (entropy < 2.0) classification = 'Highly Structured (or zero-filled)';
        else if (entropy > 6.0) classification = 'Complex/Packed';

        resolve({ entropy, barcode: normalizedBarcode, classification });
      });

      stream.on('error', reject);
    });
  }

  /**
   * 7. File Structure Analysis
   * Gathers extension information, entropy details, and timestamps to analyze structure.
   * @param {string} filePath - Absolute path to the file.
   * @param {fs.Stats} stat - File stat object.
   * @returns {Promise<Object>} Structure analysis details.
   */
  async analyzeStructure(filePath, stat) {
    const entropyData = await this.calculateForensicEntropy(filePath);
    const magicData = await this.detectMagic(filePath);
    
    const parsedPath = path.parse(filePath);
    const fileName = parsedPath.base;
    const parts = fileName.split('.');
    
    const hasDoubleExtension = parts.length > 2;
    const hasHiddenExtension = fileName.endsWith(' ') || fileName.endsWith('.');
    
    // Check for suspicious extensions like common right-to-left override character abuses
    const hasSuspiciousExtension = /[\u200E\u200F\u202A-\u202E]/.test(fileName);
    
    return {
      isText: (magicData.type === 'document' || !magicData.detected && entropyData.entropy < 6.0),
      isBinary: magicData.detected && magicData.type !== 'document',
      isArchive: magicData.type === 'archive',
      isExecutable: magicData.type === 'executable',
      isEncrypted: entropyData.entropy > 7.5,
      hasHiddenExtension,
      hasDoubleExtension,
      hasSuspiciousExtension,
      entropy: entropyData.entropy,
      entropyClassification: entropyData.classification,
      barcode: entropyData.barcode,
      timestamps: {
        created: stat.birthtime,
        modified: stat.mtime,
        accessed: stat.atime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };
  }

  /**
   * 8. Suspicious File Detection
   * Evaluates analysis data to compile heuristic warnings.
   * @param {string} filePath - Absolute path to the file.
   * @param {Object} magicResult - Output from detectMagic().
   * @param {Object} structureData - Output from analyzeStructure().
   * @returns {Array<{type: string, severity: string, message: string}>} Array of warnings.
   */
  checkSuspicious(filePath, magicResult, structureData) {
    const warnings = [];
    const mismatchData = this.detectMismatch(filePath, magicResult);

    if (mismatchData.mismatch && mismatchData.severity !== 'info') {
      warnings.push({
        type: mismatchData.severity === 'critical' ? 'exe-disguise' : 'extension-mismatch',
        severity: mismatchData.severity,
        message: mismatchData.message
      });
    }

    if (structureData.hasDoubleExtension) {
      warnings.push({
        type: 'double-extension',
        severity: 'warning',
        message: 'File has multiple extensions which may be used to mask its true type.'
      });
    }

    if (structureData.hasHiddenExtension) {
      warnings.push({
        type: 'hidden-extension',
        severity: 'warning',
        message: 'File name ends with spaces or trailing dots which could hide the extension.'
      });
    }

    if (structureData.hasSuspiciousExtension) {
      warnings.push({
        type: 'suspicious-extension',
        severity: 'critical',
        message: 'File name contains suspicious Unicode characters (e.g. RLO) which can alter display order.'
      });
    }

    if (structureData.entropy > 7.9) {
      warnings.push({
        type: 'high-entropy',
        severity: 'warning',
        message: 'Extremely high entropy indicating packed, encrypted, or obfuscated contents.'
      });
    }

    return warnings;
  }

  /**
   * 9. Complete Forensic Report
   * Runs all modules to generate a comprehensive analysis of the file.
   * @param {string} filePath - Absolute path to the file.
   * @returns {Promise<Object>} Complete forensic report object.
   */
  async generateForensicReport(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      
      const [hashes, magicBytes, textPreview, hexPreview, structure] = await Promise.all([
        this.calculateHashes(filePath),
        this.detectMagic(filePath),
        this.getTextPreview(filePath),
        this.getHexDump(filePath, 0, 512),
        this.analyzeStructure(filePath, stats)
      ]);

      const mismatch = this.detectMismatch(filePath, magicBytes);
      const suspiciousFlags = this.checkSuspicious(filePath, magicBytes, structure);

      return {
        identity: {
          path: filePath,
          size: stats.size
        },
        hashes,
        magicBytes,
        mismatch,
        structure,
        suspiciousFlags,
        hexPreview,
        textPreview,
        timestamps: structure.timestamps
      };
    } catch (err) {
      throw new Error(`Failed to generate forensic report: ${err.message}`);
    }
  }
}

module.exports = ForensicEngine;

