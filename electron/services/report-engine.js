const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/**
 * ReportEngine generates professional reports in multiple formats.
 * Supports PDF, HTML, CSV, JSON, and TXT.
 */
class ReportEngine {
  /**
   * @param {Object} options Options for the report engine
   */
  constructor(options = {}) {
    this.author = options.author || 'Uday Kiran Jammula';
    this.generator = 'FileDNA 2.0';
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Escape CSV to prevent formula injection
   * @param {string} str String to escape
   * @returns {string} Escaped string
   */
  escapeCsv(str) {
    if (str === null || str === undefined) return '""';
    let s = String(str);
    // Prevent formula injection
    if (/^[=+\-@]/.test(s)) {
      s = "'" + s;
    }
    // Escape quotes and wrap in quotes
    return `"${s.replace(/"/g, '""')}"`;
  }

  /**
   * Format file size to human-readable format
   * @param {number} bytes File size in bytes
   * @returns {string} Human-readable size
   */
  formatSize(bytes) {
    if (bytes === 0 || bytes === null || bytes === undefined) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format ISO date to human-readable format
   * @param {string} iso ISO date string
   * @returns {string} Human-readable date
   */
  formatDate(iso) {
    if (!iso) return 'N/A';
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  /**
   * Create a base report object
   * @param {string} type Report type
   * @param {string} title Report title
   * @returns {Object} Base report object
   */
  _createBaseReport(type, title) {
    return {
      type,
      title,
      generatedAt: new Date().toISOString(),
      generator: this.generator,
      author: this.author,
      summary: {},
      sections: [],
      data: [],
      warnings: [],
      metadata: {}
    };
  }

  // --- Report Builders ---

  /**
   * Build a folder scan report
   * @param {Object} scanResults Results from ScanEngine
   * @returns {Object} Report data structure
   */
  buildScanReport(scanResults) {
    const report = this._createBaseReport('Folder Scan Report', 'Folder Scan Summary');
    report.summary = {
      totalFiles: scanResults.totalFiles || 0,
      totalSize: this.formatSize(scanResults.totalSize || 0),
      scanDuration: scanResults.duration ? `${scanResults.duration} ms` : 'N/A',
      folderPath: scanResults.folderPath || 'Unknown'
    };

    report.sections.push({
      title: 'Scan Summary',
      content: `Scanned ${report.summary.totalFiles} files in ${report.summary.folderPath}. Total size: ${report.summary.totalSize}.`
    });

    if (scanResults.categories) {
      let catStr = 'File breakdown by category:\n';
      for (const [cat, count] of Object.entries(scanResults.categories)) {
        catStr += `- ${cat}: ${count}\n`;
      }
      report.sections.push({ title: 'Categories', content: catStr });
    }

    if (scanResults.errors && scanResults.errors.length > 0) {
      report.warnings = scanResults.errors;
      report.sections.push({
        title: 'Errors',
        content: `Encountered ${scanResults.errors.length} errors during scan.`
      });
    }

    report.data = scanResults.files || [];
    return report;
  }

  /**
   * Build a file analysis report
   * @param {Object} fileData DNA data for a single file
   * @returns {Object} Report data structure
   */
  buildFileAnalysisReport(fileData) {
    const report = this._createBaseReport('File Analysis Report', 'File Deep Analysis');
    report.summary = {
      filename: fileData.filename || 'Unknown',
      size: this.formatSize(fileData.size || 0),
      extension: fileData.extension || 'N/A'
    };

    report.sections.push({
      title: 'Identity',
      content: `File: ${report.summary.filename}\nPath: ${fileData.path || 'N/A'}\nSize: ${report.summary.size}`
    });

    if (fileData.hashes) {
      let hashStr = '';
      for (const [alg, val] of Object.entries(fileData.hashes)) {
        hashStr += `${alg.toUpperCase()}: ${val}\n`;
      }
      report.sections.push({ title: 'Cryptographic Hashes', content: hashStr });
    }

    if (fileData.metadata) {
      report.sections.push({
        title: 'Metadata',
        content: JSON.stringify(fileData.metadata, null, 2)
      });
    }

    report.data = [fileData];
    return report;
  }

  /**
   * Build a duplicate detection report
   * @param {Object} duplicateData Duplicate detection results
   * @returns {Object} Report data structure
   */
  buildDuplicateReport(duplicateData) {
    const report = this._createBaseReport('Duplicate Detection Report', 'Duplicate Files Summary');
    report.summary = {
      groupsFound: duplicateData.groups ? duplicateData.groups.length : 0,
      filesToReclaim: duplicateData.redundantFiles || 0,
      spaceToReclaim: this.formatSize(duplicateData.redundantSize || 0)
    };

    report.sections.push({
      title: 'Summary',
      content: `Found ${report.summary.groupsFound} duplicate groups. You can reclaim ${report.summary.spaceToReclaim} by deleting ${report.summary.filesToReclaim} files.`
    });

    report.data = duplicateData.groups || [];
    return report;
  }

  /**
   * Build a hash verification report
   * @param {Object} verificationResults Hash verification results
   * @returns {Object} Report data structure
   */
  buildHashVerificationReport(verificationResults) {
    const report = this._createBaseReport('Hash Verification Report', 'Hash Verification Results');
    report.summary = {
      total: verificationResults.total || 0,
      passed: verificationResults.passed || 0,
      failed: verificationResults.failed || 0
    };

    report.sections.push({
      title: 'Pass/Fail Summary',
      content: `Total checked: ${report.summary.total}\nPassed: ${report.summary.passed}\nFailed: ${report.summary.failed}`
    });

    report.data = verificationResults.results || [];
    return report;
  }

  /**
   * Build a forensic inspection report
   * @param {Object} forensicData Forensic engine output
   * @returns {Object} Report data structure
   */
  buildForensicReport(forensicData) {
    const report = this._createBaseReport('Forensic Inspection Report', 'Forensic Analysis');
    report.summary = {
      file: forensicData.file || 'Unknown',
      suspiciousFlags: forensicData.flags ? forensicData.flags.length : 0
    };

    report.sections.push({
      title: 'Identity & Signatures',
      content: `File: ${report.summary.file}\nMIME Type: ${forensicData.mime || 'N/A'}\nMagic Signature: ${forensicData.magic || 'N/A'}`
    });

    if (forensicData.flags && forensicData.flags.length > 0) {
      let flagsStr = forensicData.flags.map(f => `- ${f}`).join('\n');
      report.sections.push({ title: 'Suspicious Flags', content: flagsStr });
      report.warnings = forensicData.flags;
    }

    report.data = [forensicData];
    return report;
  }

  // --- Exporters ---

  /**
   * Export to Plain Text
   * @param {Object} reportData Data to export
   * @param {string} filePath Destination path
   */
  async exportTxt(reportData, filePath) {
    let content = `========================================================\n`;
    content += ` ${reportData.generator} - ${reportData.title}\n`;
    content += `========================================================\n\n`;
    content += `Generated At: ${this.formatDate(reportData.generatedAt)}\n`;
    content += `Author: ${reportData.author}\n\n`;

    content += `--- SUMMARY ---\n`;
    for (const [k, v] of Object.entries(reportData.summary)) {
      content += `${k}: ${v}\n`;
    }
    content += `\n`;

    for (const sec of reportData.sections) {
      content += `--- ${sec.title.toUpperCase()} ---\n`;
      content += `${sec.content}\n\n`;
    }

    if (reportData.warnings && reportData.warnings.length > 0) {
      content += `--- WARNINGS ---\n`;
      for (const w of reportData.warnings) {
        content += `! ${w}\n`;
      }
      content += `\n`;
    }

    await fs.writeFile(filePath, content, 'utf8');
  }

  /**
   * Export to CSV
   * @param {Object} reportData Data to export
   * @param {string} filePath Destination path
   */
  async exportCsv(reportData, filePath) {
    if (!reportData.data || reportData.data.length === 0) {
      await fs.writeFile(filePath, '"Message"\n"No data available"', 'utf8');
      return;
    }

    // Extract headers from the first object
    const headers = Object.keys(reportData.data[0]);
    let csv = headers.map(h => this.escapeCsv(h)).join(',') + '\n';

    for (const row of reportData.data) {
      const line = headers.map(h => {
        let val = row[h];
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        }
        return this.escapeCsv(val);
      }).join(',');
      csv += line + '\n';
    }

    await fs.writeFile(filePath, csv, 'utf8');
  }

  /**
   * Export to JSON
   * @param {Object} reportData Data to export
   * @param {string} filePath Destination path
   */
  async exportJson(reportData, filePath) {
    await fs.writeFile(filePath, JSON.stringify(reportData, null, 2), 'utf8');
  }

  /**
   * Export to HTML
   * @param {Object} reportData Data to export
   * @param {string} filePath Destination path
   */
  async exportHtml(reportData, filePath) {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${this.escapeHtml(reportData.title)}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #333; }
    h1 { color: #005A9C; border-bottom: 2px solid #005A9C; padding-bottom: 10px; }
    h2 { color: #0078D7; margin-top: 30px; }
    .meta { font-size: 0.9em; color: #666; margin-bottom: 30px; }
    .section { background: #f9f9f9; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .warnings { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(reportData.title)}</h1>
  <div class="meta">
    <p><strong>Generated By:</strong> ${this.escapeHtml(reportData.generator)}</p>
    <p><strong>Date:</strong> ${this.escapeHtml(this.formatDate(reportData.generatedAt))}</p>
    <p><strong>Author:</strong> ${this.escapeHtml(reportData.author)}</p>
  </div>

  <h2>Summary</h2>
  <div class="section">
    <ul>`;
    for (const [k, v] of Object.entries(reportData.summary)) {
      html += `<li><strong>${this.escapeHtml(k)}:</strong> ${this.escapeHtml(v)}</li>`;
    }
    html += `</ul>
  </div>`;

    if (reportData.warnings && reportData.warnings.length > 0) {
      html += `<h2>Warnings</h2>
      <div class="warnings"><ul>`;
      for (const w of reportData.warnings) {
        html += `<li>${this.escapeHtml(w)}</li>`;
      }
      html += `</ul></div>`;
    }

    for (const sec of reportData.sections) {
      html += `<h2>${this.escapeHtml(sec.title)}</h2>
      <div class="section"><pre>${this.escapeHtml(sec.content)}</pre></div>`;
    }

    html += `</body></html>`;
    await fs.writeFile(filePath, html, 'utf8');
  }

  /**
   * Export to PDF
   * @param {Object} reportData Data to export
   * @param {string} filePath Destination path
   */
  async exportPdf(reportData, filePath) {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    let y = height - 50;

    const drawText = (text, size, isBold = false) => {
      const f = isBold ? boldFont : font;
      const lines = String(text).split('\n');
      for (const line of lines) {
        if (y < 50) {
          page = pdfDoc.addPage();
          y = height - 50;
        }
        const str = typeof line === 'object' ? JSON.stringify(line) : String(line);
        const safeStr = str.replace(/[^\x00-\xFF]/g, '?'); // basic ASCII fallback
        page.drawText(safeStr, { x: 50, y, size, font: f, color: rgb(0, 0, 0) });
        y -= size + 5;
      }
    };

    drawText(`${reportData.generator} - ${reportData.title}`, 20, true);
    y -= 10;
    drawText(`Generated At: ${this.formatDate(reportData.generatedAt)}`, 12);
    drawText(`Author: ${reportData.author}`, 12);
    y -= 20;

    drawText('SUMMARY', 14, true);
    for (const [k, v] of Object.entries(reportData.summary)) {
      drawText(`${k}: ${v}`, 12);
    }
    y -= 15;

    for (const sec of reportData.sections) {
      drawText(sec.title, 14, true);
      const lines = sec.content.split('\n');
      for (const line of lines) {
        const maxLen = 90;
        let remaining = line;
        while (remaining.length > 0) {
          const chunk = remaining.substring(0, maxLen);
          drawText(chunk, 10);
          remaining = remaining.substring(maxLen);
        }
      }
      y -= 15;
    }

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(filePath, pdfBytes);
  }
}

module.exports = ReportEngine;
