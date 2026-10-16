const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Import Service Engines
const { ScanEngine } = require('./services/scan-engine.js');
const ForensicEngine = require('./services/forensic-engine.js');
const PdfEngine = require('./services/pdf-engine.js');
const metadataEngine = require('./services/metadata-engine.js');
const ConverterEngine = require('./services/converter-engine.js');
const ReportEngine = require('./services/report-engine.js');

// Instantiate Service Engines
const scanEngine = new ScanEngine();
const forensicEngine = new ForensicEngine();
const pdfEngine = new PdfEngine();
const converterEngine = new ConverterEngine();
const reportEngine = new ReportEngine({ author: 'User' });

let mainWindow = null;
let STORAGE_PATH = null;
let SETTINGS_PATH = null;

// Settings
let appSettings = {
  theme: 'dark',
  scanDefaults: { maxDepth: 50, excludeFolders: ['node_modules', '.git'], maxFileSize: 10 * 1024 * 1024 * 1024 },
  exportFormat: 'json'
};

// File DNA Central Index
let fileIndex = {
  files: new Map(),
  tags: new Map(),
  categories: new Map()
};

// Known File Signatures (Magic Bytes) - Fallback
const MAGIC_SIGNATURES = [
  { magic: [0x89, 0x50, 0x4E, 0x47], ext: '.png', desc: 'PNG Image' },
  { magic: [0xFF, 0xD8, 0xFF], ext: '.jpg', desc: 'JPEG Image' },
  { magic: [0x47, 0x49, 0x46, 0x38], ext: '.gif', desc: 'GIF Image' },
  { magic: [0x25, 0x50, 0x44, 0x46], ext: '.pdf', desc: 'PDF Document' },
  { magic: [0x50, 0x4B, 0x03, 0x04], ext: '.zip', desc: 'ZIP Archive / Office OpenXML' },
  { magic: [0x52, 0x61, 0x72, 0x21], ext: '.rar', desc: 'RAR Archive' },
  { magic: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], ext: '.7z', desc: '7-Zip Archive' },
  { magic: [0x4D, 0x5A], ext: '.exe', desc: 'Windows PE Executable / DLL' },
  { magic: [0x1F, 0x8B], ext: '.gz', desc: 'GZIP Archive' },
  { magic: [0x49, 0x44, 0x33], ext: '.mp3', desc: 'MP3 Audio (ID3)' },
  { magic: [0x52, 0x49, 0x46, 0x46], ext: '.wav', desc: 'RIFF Audio/Video' },
  { magic: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], ext: '.mp4', desc: 'MP4 Video' }
];

// Fallback old functions
function calculateHashes(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const stream = fs.createReadStream(filePath);
      const sha256 = crypto.createHash('sha256');
      const md5 = crypto.createHash('md5');

      stream.on('data', (chunk) => {
        sha256.update(chunk);
        md5.update(chunk);
      });

      stream.on('end', () => {
        resolve({
          sha256: sha256.digest('hex'),
          md5: md5.digest('hex')
        });
      });

      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

function calculateForensicEntropy(filePath, fileSize) {
  return new Promise((resolve) => {
    try {
      const sampleSize = Math.min(fileSize, 4 * 1024 * 1024);
      if (sampleSize === 0) {
        return resolve({ entropy: 0, classification: 'Empty File', barcode: new Array(16).fill(0) });
      }

      const buffer = Buffer.alloc(sampleSize);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, sampleSize, 0);
      fs.closeSync(fd);

      const freq = new Array(256).fill(0);
      for (let i = 0; i < sampleSize; i++) {
        freq[buffer[i]]++;
      }

      let entropy = 0;
      for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
          const p = freq[i] / sampleSize;
          entropy -= p * Math.log2(p);
        }
      }

      entropy = parseFloat(entropy.toFixed(3));

      let classification = 'Standard Binary';
      if (entropy === 0) classification = 'Zeroed / Sparse';
      else if (entropy < 3.5) classification = 'Plain Text / Structured Code';
      else if (entropy < 5.5) classification = 'Formatted Document / Structured Data';
      else if (entropy < 7.2) classification = 'Native Binary / Compiled Code';
      else classification = 'High Entropy (Compressed / Encrypted)';

      const barcode = [];
      const bucketSize = 16;
      for (let b = 0; b < 16; b++) {
        let sum = 0;
        for (let i = 0; i < bucketSize; i++) {
          sum += freq[b * bucketSize + i];
        }
        barcode.push(Math.round((sum / sampleSize) * 100));
      }

      resolve({ entropy, classification, barcode });
    } catch (err) {
      resolve({ entropy: 0, classification: 'Unknown', barcode: new Array(16).fill(0) });
    }
  });
}

function inspectMagicBytes(filePath) {
  try {
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    if (bytesRead < 2) return { detected: false, signature: 'None', headerHex: '' };

    const headerHex = buffer.slice(0, Math.min(8, bytesRead)).toString('hex').toUpperCase();

    for (const sig of MAGIC_SIGNATURES) {
      let match = true;
      if (sig.magic.length > bytesRead) continue;
      for (let i = 0; i < sig.magic.length; i++) {
        if (buffer[i] !== sig.magic[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        return { detected: true, signature: sig.desc, ext: sig.ext, headerHex };
      }
    }

    return { detected: false, signature: 'Generic Data', headerHex };
  } catch (err) {
    return { detected: false, signature: 'Unavailable', headerHex: '' };
  }
}

function getCategory(ext) {
  const categoryMap = {
    '.pdf': 'Documents', '.doc': 'Documents', '.docx': 'Documents', '.txt': 'Documents',
    '.md': 'Documents', '.rtf': 'Documents', '.odt': 'Documents', '.xlsx': 'Documents',
    '.xls': 'Documents', '.pptx': 'Documents', '.ppt': 'Documents',
    '.json': 'Data', '.csv': 'Data', '.xml': 'Data', '.sql': 'Data', '.yaml': 'Data',
    '.yml': 'Data', '.parquet': 'Data', '.sqlite': 'Data', '.db': 'Data',
    '.zip': 'Archives', '.rar': 'Archives', '.7z': 'Archives', '.tar': 'Archives',
    '.gz': 'Archives', '.bz2': 'Archives', '.iso': 'Archives',
    '.png': 'Images', '.jpg': 'Images', '.jpeg': 'Images', '.gif': 'Images',
    '.webp': 'Images', '.svg': 'Images', '.bmp': 'Images', '.ico': 'Images',
    '.mp3': 'Audio', '.wav': 'Audio', '.flac': 'Audio', '.aac': 'Audio',
    '.m4a': 'Audio', '.ogg': 'Audio',
    '.mp4': 'Video', '.mov': 'Video', '.mkv': 'Video', '.avi': 'Video',
    '.wmv': 'Video', '.webm': 'Video',
    '.js': 'Code', '.ts': 'Code', '.jsx': 'Code', '.tsx': 'Code', '.py': 'Code',
    '.cpp': 'Code', '.c': 'Code', '.h': 'Code', '.hpp': 'Code', '.java': 'Code',
    '.cs': 'Code', '.go': 'Code', '.rs': 'Code', '.html': 'Code', '.css': 'Code',
    '.scss': 'Code', '.php': 'Code', '.sh': 'Code', '.bat': 'Code', '.ps1': 'Code',
    '.exe': 'Executables', '.dll': 'Executables', '.msi': 'Executables'
  };

  return categoryMap[ext.toLowerCase()] || 'Other';
}

function detectMimeType(ext) {
  const mimeTypes = {
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.flac': 'audio/flac', '.zip': 'application/zip', '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed', '.txt': 'text/plain', '.md': 'text/markdown',
    '.json': 'application/json', '.csv': 'text/csv', '.html': 'text/html',
    '.css': 'text/css', '.js': 'application/javascript', '.ts': 'application/typescript',
    '.xml': 'application/xml', '.exe': 'application/x-msdownload', '.dll': 'application/x-msdownload'
  };

  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

function analyzeContent(filePath, ext, size) {
  const isText = ['.txt', '.md', '.json', '.csv', '.js', '.ts', '.html', '.css', '.py', '.c', '.cpp', '.h', '.xml', '.yaml', '.yml'].includes(ext.toLowerCase());
  if (!isText || size > 10 * 1024 * 1024) {
    return { isText: false, lines: null, words: null, chars: null };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r\n|\r|\n/);
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return {
      isText: true,
      lines: lines.length,
      words: words,
      chars: content.length,
      blankLines: lines.filter(l => l.trim() === '').length
    };
  } catch (err) {
    return { isText: false, error: 'Could not decode text' };
  }
}

// Storage persistence
function initializeStorage() {
  try {
    STORAGE_PATH = path.join(app.getPath('userData'), 'filedna-index.json');
    SETTINGS_PATH = path.join(app.getPath('userData'), 'filedna-settings.json');
    
    if (fs.existsSync(STORAGE_PATH)) {
      const raw = fs.readFileSync(STORAGE_PATH, 'utf8');
      const data = JSON.parse(raw);
      fileIndex.files = new Map(Object.entries(data.files || {}));
      rebuildIndexes();
    }
    
    if (fs.existsSync(SETTINGS_PATH)) {
      const rawSettings = fs.readFileSync(SETTINGS_PATH, 'utf8');
      appSettings = { ...appSettings, ...JSON.parse(rawSettings) };
    }
  } catch (err) {
    console.error('Storage initialization failed:', err);
  }
}

function writeIndex() {
  try {
    if (STORAGE_PATH) {
      const payload = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        files: Object.fromEntries(fileIndex.files)
      };
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(payload, null, 2), 'utf8');
    }
    if (SETTINGS_PATH) {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(appSettings, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('Failed to write index to disk:', err);
  }
}

function rebuildIndexes() {
  fileIndex.categories = new Map();
  fileIndex.tags = new Map();

  for (const [filePath, fileData] of fileIndex.files) {
    const cat = fileData.category || 'Other';
    if (!fileIndex.categories.has(cat)) fileIndex.categories.set(cat, new Set());
    fileIndex.categories.get(cat).add(filePath);
  }
}

// Process a single file and calculate its full DNA
async function processFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;

    const ext = path.extname(filePath).toLowerCase() || '.unknown';
    const name = path.basename(filePath);
    const category = getCategory(ext);

    let hashes, forensics, magic, content;
    
    try {
      hashes = await forensicEngine.calculateHashes(filePath);
      const forensicRes = await forensicEngine.calculateForensicEntropy(filePath);
      forensics = { entropy: forensicRes.entropy, classification: forensicRes.classification, barcode: forensicRes.barcode };
      const magicRes = await forensicEngine.detectMagic(filePath);
      magic = { detected: magicRes.detected, signature: magicRes.signature || 'Generic Data', headerHex: magicRes.headerHex };
    } catch (e) {
      // Fallback
      hashes = await calculateHashes(filePath);
      forensics = await calculateForensicEntropy(filePath, stat.size);
      magic = inspectMagicBytes(filePath);
    }
    
    content = analyzeContent(filePath, ext, stat.size);

    const fileData = {
      path: filePath,
      name: name,
      extension: ext,
      category: category,
      mimeType: detectMimeType(ext),
      size: stat.size,
      sha256: hashes.sha256,
      md5: hashes.md5,
      entropy: forensics.entropy,
      entropyClassification: forensics.classification,
      barcode: forensics.barcode,
      magic: magic,
      content: content,
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      indexedAt: new Date().toISOString()
    };

    fileIndex.files.set(filePath, fileData);

    const cat = fileData.category;
    if (!fileIndex.categories.has(cat)) fileIndex.categories.set(cat, new Set());
    fileIndex.categories.get(cat).add(filePath);

    return fileData;
  } catch (err) {
    console.error(`Failed to process ${filePath}:`, err);
    return null;
  }
}

// Old scanDirectory fallback just in case
async function scanDirectory(dir, processedFiles = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scanDirectory(fullPath, processedFiles);
          }
        } else if (entry.isFile()) {
          const res = await processFile(fullPath);
          if (res) processedFiles.push(res);
        }
      } catch (e) {}
    }
  } catch (err) {}
  return processedFiles;
}

// Compute duplicate groups
function computeDuplicates() {
  const hashGroups = new Map();
  for (const file of fileIndex.files.values()) {
    if (!file.sha256) continue;
    if (!hashGroups.has(file.sha256)) hashGroups.set(file.sha256, []);
    hashGroups.get(file.sha256).push(file);
  }

  const duplicates = [];
  let totalWastedBytes = 0;
  let totalDuplicateCount = 0;

  for (const [hash, group] of hashGroups) {
    if (group.length > 1) {
      const count = group.length;
      const wastedBytes = (count - 1) * group[0].size;
      totalWastedBytes += wastedBytes;
      totalDuplicateCount += (count - 1);

      duplicates.push({
        sha256: hash,
        count: count,
        sizePerFile: group[0].size,
        wastedBytes: wastedBytes,
        sampleName: group[0].name,
        category: group[0].category,
        files: group.map(f => ({
          name: f.name,
          path: f.path,
          size: f.size,
          modified: f.modified
        }))
      });
    }
  }

  duplicates.sort((a, b) => b.wastedBytes - a.wastedBytes);

  return {
    duplicates,
    totalDuplicateCount,
    totalWastedBytes,
    totalWastedMB: (totalWastedBytes / (1024 * 1024)).toFixed(2)
  };
}

// Compute dashboard aggregates
function computeDashboard() {
  const files = Array.from(fileIndex.files.values());
  const totalFiles = files.length;
  const totalStorage = files.reduce((acc, f) => acc + (f.size || 0), 0);

  const categoryCounts = {};
  const categoryStorage = {};

  for (const f of files) {
    const cat = f.category || 'Other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    categoryStorage[cat] = (categoryStorage[cat] || 0) + (f.size || 0);
  }

  const dups = computeDuplicates();

  const recentFiles = [...files]
    .sort((a, b) => new Date(b.indexedAt) - new Date(a.indexedAt))
    .slice(0, 15);

  let avgEntropy = 0;
  if (totalFiles > 0) {
    avgEntropy = parseFloat((files.reduce((acc, f) => acc + (f.entropy || 0), 0) / totalFiles).toFixed(2));
  }

  return {
    totalFiles,
    totalStorage,
    totalStorageMB: (totalStorage / (1024 * 1024)).toFixed(2),
    totalStorageGB: (totalStorage / (1024 * 1024 * 1024)).toFixed(3),
    categoryCounts,
    categoryStorage,
    duplicateCount: dups.totalDuplicateCount,
    wastedBytes: dups.totalWastedBytes,
    wastedMB: dups.totalWastedMB,
    avgEntropy,
    recentFiles
  };
}


// Event listeners for ScanEngine to forward to Renderer
scanEngine.on('progress', (data) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('scan-progress', data);
  }
});
scanEngine.on('scan-complete', (data) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('scan-complete', data);
  }
});
scanEngine.on('scan-cancelled', (data) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('scan-cancelled', data);
  }
});


// IPC Handlers
function registerIpcHandlers() {
  
  // ==========================================
  // PRESERVED OLD IPC HANDLERS
  // ==========================================
  
  ipcMain.handle('import-files', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Files or Folders for File DNA Analysis',
        properties: ['openFile', 'openDirectory', 'multiSelections']
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, count: 0, canceled: true };
      }

      const processed = [];
      for (const p of result.filePaths) {
        if (fs.statSync(p).isDirectory()) {
          // Use new ScanEngine
          await scanEngine.scan([p], async (filePath, stat) => {
            const item = await processFile(filePath);
            if (item) processed.push(item);
          });
        } else {
          const item = await processFile(p);
          if (item) processed.push(item);
        }
      }

      writeIndex();
      return {
        success: true,
        count: processed.length,
        totalIndexed: fileIndex.files.size
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('process-paths', async (event, paths) => {
    try {
      if (!paths || !Array.isArray(paths)) return { success: false, count: 0 };
      const processed = [];
      for (const p of paths) {
        if (fs.existsSync(p)) {
          if (fs.statSync(p).isDirectory()) {
            await scanEngine.scan([p], async (filePath, stat) => {
              const item = await processFile(filePath);
              if (item) processed.push(item);
            });
          } else {
            const item = await processFile(p);
            if (item) processed.push(item);
          }
        }
      }
      writeIndex();
      return { success: true, count: processed.length, totalIndexed: fileIndex.files.size };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('analyze-file', async (event, filePath) => {
    try {
      let file = fileIndex.files.get(filePath);
      if (!file && fs.existsSync(filePath)) {
        file = await processFile(filePath);
        writeIndex();
      }
      return file || null;
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle('get-file-dna', async (event, filePath) => {
    try {
      let file = fileIndex.files.get(filePath);
      if (!file && fs.existsSync(filePath)) {
        file = await processFile(filePath);
        writeIndex();
      }
      if (!file) return null;

      let matchCount = 0;
      const duplicateCopies = [];
      for (const other of fileIndex.files.values()) {
        if (other.sha256 === file.sha256) {
          matchCount++;
          duplicateCopies.push({ name: other.name, path: other.path });
        }
      }

      return {
        identity: {
          name: file.name,
          path: file.path,
          extension: file.extension,
          category: file.category,
          size: file.size,
          mimeType: file.mimeType,
          magic: file.magic
        },
        forensics: {
          sha256: file.sha256,
          md5: file.md5,
          entropy: file.entropy,
          classification: file.entropyClassification,
          barcode: file.barcode
        },
        content: file.content,
        temporal: {
          created: file.created,
          modified: file.modified,
          indexedAt: file.indexedAt
        },
        duplicates: {
          isUnique: matchCount <= 1,
          matchCount: matchCount,
          copies: duplicateCopies
        }
      };
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle('search-files', async (event, { query = '', category = 'All' }) => {
    try {
      const q = query.trim().toLowerCase();
      const results = [];

      for (const file of fileIndex.files.values()) {
        if (category !== 'All' && file.category !== category) continue;
        if (!q) {
          results.push(file);
          continue;
        }

        const matchName = file.name.toLowerCase().includes(q);
        const matchExt = file.extension.toLowerCase().includes(q);
        const matchHash = (file.sha256 && file.sha256.toLowerCase().includes(q)) || (file.md5 && file.md5.toLowerCase().includes(q));
        const matchPath = file.path.toLowerCase().includes(q);

        if (matchName || matchExt || matchHash || matchPath) {
          results.push(file);
        }
      }
      results.sort((a, b) => new Date(b.modified) - new Date(a.modified));
      return results;
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('duplicate-detection', async () => {
    try {
      return computeDuplicates();
    } catch (err) {
      return { duplicates: [], totalDuplicateCount: 0, totalWastedBytes: 0, totalWastedMB: '0.00' };
    }
  });

  ipcMain.handle('get-dashboard-data', async () => {
    try {
      return computeDashboard();
    } catch (err) {
      return {};
    }
  });

  ipcMain.handle('reveal-in-explorer', async (event, filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  });

  ipcMain.handle('remove-from-index', async (event, filePath) => {
    try {
      const existed = fileIndex.files.delete(filePath);
      if (existed) {
        rebuildIndexes();
        writeIndex();
      }
      return existed;
    } catch (err) {
      return false;
    }
  });

  ipcMain.handle('delete-file', async (event, filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        await shell.trashItem(filePath);
        fileIndex.files.delete(filePath);
        rebuildIndexes();
        writeIndex();
        return { success: true };
      }
      return { success: false, error: 'File does not exist' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('clear-index', async () => {
    try {
      fileIndex.files.clear();
      fileIndex.tags.clear();
      fileIndex.categories.clear();
      writeIndex();
      return true;
    } catch (err) {
      return false;
    }
  });

  ipcMain.handle('export-report', async (event, format = 'json') => {
    try {
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export File DNA Report',
        defaultPath: `FileDNA-Report-${Date.now()}.${format}`,
        filters: format === 'csv' ? [{ name: 'CSV', extensions: ['csv'] }] : [{ name: 'JSON', extensions: ['json'] }]
      });

      if (!filePath) return { success: false, canceled: true };

      const files = Array.from(fileIndex.files.values());
      if (format === 'csv') {
        const titleLine = '# File DNA Intelligence Report - Created by Uday Kiran Jammula\n';
        const headers = ['Name', 'Category', 'Size (Bytes)', 'SHA-256', 'MD5', 'Entropy', 'Path', 'Modified'];
        const rows = files.map(f => [
          `"${(f.name || '').replace(/"/g, '""')}"`,
          `"${f.category || ''}"`,
          f.size || 0,
          `"${f.sha256 || ''}"`,
          `"${f.md5 || ''}"`,
          f.entropy || 0,
          `"${(f.path || '').replace(/"/g, '""')}"`,
          `"${f.modified || ''}"`
        ]);
        const csv = titleLine + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        fs.writeFileSync(filePath, csv, 'utf8');
      } else {
        const json = JSON.stringify({
          software: "File DNA",
          version: "2.0.0",
          creator: "Uday Kiran Jammula",
          generatedAt: new Date().toISOString(),
          summary: computeDashboard(),
          files: files
        }, null, 2);
        fs.writeFileSync(filePath, json, 'utf8');
      }

      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
  });
  ipcMain.handle('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  // ==========================================
  // NEW IPC HANDLERS - Scanning
  // ==========================================
  ipcMain.handle('scan-start', async (event, options) => {
    try {
      scanEngine.options = { ...scanEngine.options, ...options };
      const res = await scanEngine.scan(options.paths || [], async (filePath, stat) => {
        return await processFile(filePath);
      });
      writeIndex();
      return { success: true, count: res.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('scan-pause', () => { try { scanEngine.pause(); return true; } catch (e) { return false; } });
  ipcMain.handle('scan-resume', () => { try { scanEngine.resume(); return true; } catch (e) { return false; } });
  ipcMain.handle('scan-cancel', () => { try { scanEngine.cancel(); return true; } catch (e) { return false; } });
  ipcMain.handle('scan-status', () => { try { return scanEngine.getSummary(); } catch (e) { return {}; } });
  ipcMain.handle('scan-history', () => { try { return scanEngine.getScanHistory(); } catch (e) { return []; } });

  // ==========================================
  // NEW IPC HANDLERS - Forensics
  // ==========================================
  ipcMain.handle('forensic-analyze', async (event, filePath) => {
    try { return await forensicEngine.generateForensicReport(filePath); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('verify-hash', async (event, arg1, arg2, arg3) => {
    try {
      const filePath = typeof arg1 === 'object' && arg1 !== null ? arg1.filePath : arg1;
      const expectedHash = typeof arg1 === 'object' && arg1 !== null ? arg1.expectedHash : arg2;
      const algorithm = (typeof arg1 === 'object' && arg1 !== null ? arg1.algorithm : arg3) || 'sha256';
      return await forensicEngine.verifyHash(filePath, expectedHash, algorithm);
    } catch (e) {
      return { match: false, error: e.message };
    }
  });

  ipcMain.handle('hex-dump', async (event, arg1, arg2, arg3) => {
    try {
      const filePath = typeof arg1 === 'object' && arg1 !== null ? arg1.filePath : arg1;
      const offset = (typeof arg1 === 'object' && arg1 !== null ? arg1.offset : arg2) || 0;
      const length = (typeof arg1 === 'object' && arg1 !== null ? arg1.length : arg3) || 512;
      const res = await forensicEngine.getHexDump(filePath, offset, length);
      return { hex: res.hex, totalFileSize: res.totalFileSize };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('text-preview', async (event, arg1, arg2) => {
    try {
      const filePath = typeof arg1 === 'object' && arg1 !== null ? arg1.filePath : arg1;
      const maxBytes = (typeof arg1 === 'object' && arg1 !== null ? arg1.maxBytes : arg2) || 4096;
      return await forensicEngine.getTextPreview(filePath, maxBytes);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('check-suspicious', async (event, filePath) => {
    try {
      const rep = await forensicEngine.generateForensicReport(filePath);
      return rep.suspiciousFlags;
    } catch (e) {
      return { error: e.message };
    }
  });

  // ==========================================
  // NEW IPC HANDLERS - PDF Tools
  // ==========================================

  const getPdfBuffer = async (input) => {
    if (!input) throw new Error('No PDF file provided');
    if (Buffer.isBuffer(input) || input instanceof Uint8Array) return input;
    if (typeof input === 'string') return await fs.promises.readFile(input);
    if (typeof input === 'object') {
      if (input.path) return await fs.promises.readFile(input.path);
      if (input.filePath) return await fs.promises.readFile(input.filePath);
      if (input.file) return await getPdfBuffer(input.file);
      if (input.buffer) return input.buffer;
    }
    throw new Error('Invalid PDF input');
  };

  ipcMain.handle('pdf-create-from-text', async (event, arg1, arg2) => {
    try {
      const text = typeof arg1 === 'object' && arg1 !== null && 'text' in arg1 ? arg1.text : (arg1 || '');
      const options = typeof arg1 === 'object' && arg1 !== null && 'options' in arg1 ? arg1.options : (arg2 || {});
      const { buffer, pageCount } = await pdfEngine.createPdfFromText(text, options);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save PDF',
        defaultPath: 'document.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath, pageCount };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-create-from-images', async (event, arg1, arg2) => {
    try {
      let imagePaths = typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null && 'imagePaths' in arg1 ? arg1.imagePaths : arg1;
      const options = typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null && 'options' in arg1 ? arg1.options : (arg2 || {});
      if (!imagePaths || !imagePaths.length) {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Select Images',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] }]
        });
        if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
        imagePaths = result.filePaths;
      }
      const { buffer, pageCount } = await pdfEngine.createPdfFromImages(imagePaths, options);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save PDF',
        defaultPath: 'images.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath, pageCount };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-merge', async (event, arg1) => {
    try {
      let pdfFiles = Array.isArray(arg1) ? arg1 : (arg1 && arg1.pdfFiles);
      if (!pdfFiles || !pdfFiles.length) {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Select PDFs to Merge',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });
        if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
        pdfFiles = result.filePaths;
      }
      const buffers = await Promise.all(pdfFiles.map(p => getPdfBuffer(p)));
      const { buffer, pageCount } = await pdfEngine.mergePdfs(buffers);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Merged PDF',
        defaultPath: 'merged.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath, pageCount };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-split', async (event, arg1, arg2) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && !Buffer.isBuffer(arg1) && !(arg1 instanceof Uint8Array) && 'file' in arg1 ? arg1.file : arg1;
      let ranges = typeof arg1 === 'object' && arg1 !== null && 'ranges' in arg1 ? arg1.ranges : arg2;
      const buf = await getPdfBuffer(file);
      const results = await pdfEngine.splitPdf(buf, ranges);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Split PDF (Base Name)',
        defaultPath: 'split.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        const base = filePath.endsWith('.pdf') ? filePath.slice(0, -4) : filePath;
        const savedPaths = [];
        for (let i = 0; i < results.length; i++) {
          const outPath = `${base}-${results[i].range || (i + 1)}.pdf`;
          await fs.promises.writeFile(outPath, results[i].buffer);
          savedPaths.push(outPath);
        }
        return { success: true, filePath, path: savedPaths.join(', '), count: results.length };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-extract-pages', async (event, arg1, arg2) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      let pages = typeof arg1 === 'object' && arg1 !== null && 'pages' in arg1 ? arg1.pages : arg2;
      const buf = await getPdfBuffer(file);
      const { buffer, pageCount } = await pdfEngine.extractPages(buf, pages);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Extracted Pages',
        defaultPath: 'extracted.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath, pageCount };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-reorder', async (event, arg1, arg2) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      let newOrder = typeof arg1 === 'object' && arg1 !== null && 'newOrder' in arg1 ? arg1.newOrder : arg2;
      const buf = await getPdfBuffer(file);
      const { buffer, pageCount } = await pdfEngine.reorderPages(buf, newOrder);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Reordered PDF',
        defaultPath: 'reordered.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath, pageCount };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-rotate', async (event, arg1, arg2, arg3) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      let rotation = typeof arg1 === 'object' && arg1 !== null && 'rotation' in arg1 ? arg1.rotation : arg2;
      let pages = typeof arg1 === 'object' && arg1 !== null && 'pages' in arg1 ? arg1.pages : arg3;
      const buf = await getPdfBuffer(file);
      const { buffer, pageCount } = await pdfEngine.rotatePages(buf, rotation, pages);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Rotated PDF',
        defaultPath: 'rotated.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath, pageCount };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-delete-pages', async (event, arg1, arg2) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      let pages = typeof arg1 === 'object' && arg1 !== null && 'pages' in arg1 ? arg1.pages : arg2;
      const buf = await getPdfBuffer(file);
      const { buffer, pageCount } = await pdfEngine.deletePages(buf, pages);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Modified PDF',
        defaultPath: 'modified.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath, pageCount };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-add-watermark', async (event, arg1, arg2, arg3) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      let text = typeof arg1 === 'object' && arg1 !== null && 'text' in arg1 ? arg1.text : arg2;
      let options = typeof arg1 === 'object' && arg1 !== null && 'options' in arg1 ? arg1.options : (arg3 || {});
      const buf = await getPdfBuffer(file);
      const { buffer } = await pdfEngine.addTextWatermark(buf, text, options);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Watermarked PDF',
        defaultPath: 'watermarked.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-add-page-numbers', async (event, arg1, arg2) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      let options = typeof arg1 === 'object' && arg1 !== null && 'options' in arg1 ? arg1.options : (arg2 || {});
      const buf = await getPdfBuffer(file);
      const { buffer } = await pdfEngine.addPageNumbers(buf, options);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Numbered PDF',
        defaultPath: 'numbered.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-get-metadata', async (event, arg1) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      const buf = await getPdfBuffer(file);
      return await pdfEngine.getMetadata(buf);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('pdf-set-metadata', async (event, arg1, arg2) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      let metadata = typeof arg1 === 'object' && arg1 !== null && 'metadata' in arg1 ? arg1.metadata : (arg2 || {});
      const buf = await getPdfBuffer(file);
      const { buffer } = await pdfEngine.setMetadata(buf, metadata);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save PDF',
        defaultPath: 'meta.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-extract-text', async (event, arg1) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      const buf = await getPdfBuffer(file);
      return await pdfEngine.extractText(buf);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('pdf-get-info', async (event, arg1) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      const buf = await getPdfBuffer(file);
      return await pdfEngine.getPageThumbnailData(buf);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('pdf-compress', async (event, arg1) => {
    try {
      let file = typeof arg1 === 'object' && arg1 !== null && 'file' in arg1 ? arg1.file : arg1;
      const buf = await getPdfBuffer(file);
      const res = await pdfEngine.compressPdf(buf);
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Compressed PDF',
        defaultPath: 'compressed.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, res.buffer);
        return {
          success: true,
          filePath,
          path: filePath,
          originalSize: res.originalSize,
          compressedSize: res.compressedSize,
          savedBytes: res.originalSize - res.compressedSize
        };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pdf-save', async (event, buffer, defaultName = 'document.pdf') => {
    try {
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save PDF',
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (filePath) {
        await fs.promises.writeFile(filePath, buffer);
        return { success: true, filePath, path: filePath };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ==========================================
  // NEW IPC HANDLERS - Metadata
  // ==========================================
  ipcMain.handle('extract-metadata', async (event, filePath) => {
    try {
      return await metadataEngine.extractMetadata(filePath);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('check-privacy', async (event, filePath) => {
    try {
      const meta = await metadataEngine.extractMetadata(filePath);
      return { warnings: meta.privacyWarnings || [] };
    } catch (e) {
      return { error: e.message };
    }
  });

  // ==========================================
  // NEW IPC HANDLERS - Converter
  // ==========================================
  ipcMain.handle('convert-image', async (event, arg1, arg2, arg3) => {
    try {
      let inputPath = typeof arg1 === 'object' && arg1 !== null ? arg1.inputPath : arg1;
      let outputPath = typeof arg1 === 'object' && arg1 !== null ? arg1.outputPath : arg2;
      let options = (typeof arg1 === 'object' && arg1 !== null ? arg1.options : arg3) || {};

      const format = options.format || 'jpg';
      if (!outputPath) {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
          title: 'Save Converted Image',
          defaultPath: `converted.${format}`,
          filters: [{ name: 'Images', extensions: [format] }]
        });
        if (!filePath) return { success: false, canceled: true };
        outputPath = filePath;
      }
      const res = await converterEngine.convertImage(inputPath, outputPath, options);
      return { ...res, path: outputPath, filePath: outputPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('batch-convert-images', async (event, arg1, arg2, arg3) => {
    try {
      let files = typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.files : arg1;
      let outputDir = typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.outputDir : arg2;
      let options = (typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.options : arg3) || {};

      if (!outputDir) {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Select Output Directory',
          properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
        outputDir = result.filePaths[0];
      }
      return await converterEngine.batchConvertImages(files, outputDir, options);
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('resize-image', async (event, arg1, arg2, arg3, arg4, arg5) => {
    try {
      let inputPath = typeof arg1 === 'object' && arg1 !== null ? arg1.inputPath : arg1;
      let outputPath = typeof arg1 === 'object' && arg1 !== null ? arg1.outputPath : arg2;
      let width = typeof arg1 === 'object' && arg1 !== null ? arg1.width : arg3;
      let height = typeof arg1 === 'object' && arg1 !== null ? arg1.height : arg4;
      let options = (typeof arg1 === 'object' && arg1 !== null ? arg1.options : arg5) || {};

      if (!outputPath) {
        const ext = path.extname(inputPath).slice(1) || 'jpg';
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
          title: 'Save Resized Image',
          defaultPath: `resized.${ext}`,
          filters: [{ name: 'Image', extensions: [ext] }]
        });
        if (!filePath) return { success: false, canceled: true };
        outputPath = filePath;
      }
      const res = await converterEngine.resizeImage(inputPath, outputPath, width, height, options);
      return { ...res, path: outputPath, filePath: outputPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('compress-image', async (event, arg1, arg2, arg3) => {
    try {
      let inputPath = typeof arg1 === 'object' && arg1 !== null ? arg1.inputPath : arg1;
      let outputPath = typeof arg1 === 'object' && arg1 !== null ? arg1.outputPath : arg2;
      let quality = (typeof arg1 === 'object' && arg1 !== null ? arg1.quality : arg3) || 80;

      if (!outputPath) {
        const ext = path.extname(inputPath).slice(1) || 'jpg';
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
          title: 'Save Compressed Image',
          defaultPath: `compressed.${ext}`,
          filters: [{ name: 'Image', extensions: [ext] }]
        });
        if (!filePath) return { success: false, canceled: true };
        outputPath = filePath;
      }
      const res = await converterEngine.compressImage(inputPath, outputPath, quality);
      return { ...res, path: outputPath, filePath: outputPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-image-info', async (event, inputPath) => {
    try {
      return await converterEngine.getImageInfo(inputPath);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('create-zip', async (event, arg1, arg2, arg3) => {
    try {
      let inputPaths = typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.inputPaths : arg1;
      let outputPath = typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.outputPath : arg2;
      let options = (typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.options : arg3) || {};

      if (!outputPath) {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
          title: 'Save ZIP Archive',
          defaultPath: 'archive.zip',
          filters: [{ name: 'ZIP', extensions: ['zip'] }]
        });
        if (!filePath) return { success: false, canceled: true };
        outputPath = filePath;
      }
      const res = await converterEngine.createZipArchive(inputPaths, outputPath, options);
      return { ...res, path: outputPath, filePath: outputPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('extract-zip', async (event, arg1, arg2, arg3) => {
    try {
      let archivePath = typeof arg1 === 'object' && arg1 !== null ? arg1.archivePath : arg1;
      let outputDir = typeof arg1 === 'object' && arg1 !== null ? arg1.outputDir : arg2;
      let options = (typeof arg1 === 'object' && arg1 !== null ? arg1.options : arg3) || {};

      if (!outputDir) {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Select Extract Folder',
          properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
        outputDir = result.filePaths[0];
      }
      const res = await converterEngine.extractZipArchive(archivePath, outputDir, options);
      return { ...res, path: outputDir, outputDir };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('inspect-archive', async (event, archivePath) => {
    try {
      return await converterEngine.inspectArchive(archivePath);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('format-json', async (event, arg1, arg2, arg3) => {
    try {
      let inputPath = typeof arg1 === 'object' && arg1 !== null ? arg1.inputPath : arg1;
      let outputPath = typeof arg1 === 'object' && arg1 !== null ? arg1.outputPath : arg2;
      let indent = (typeof arg1 === 'object' && arg1 !== null ? arg1.indent : arg3) || 2;

      if (!outputPath) {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
          title: 'Save Formatted JSON',
          defaultPath: 'formatted.json',
          filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (!filePath) return { success: false, canceled: true };
        outputPath = filePath;
      }
      const res = await converterEngine.formatJson(inputPath, outputPath, indent);
      return { ...res, path: outputPath, filePath: outputPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('preview-csv', async (event, arg1, arg2) => {
    try {
      let inputPath = typeof arg1 === 'object' && arg1 !== null ? arg1.inputPath : arg1;
      let maxRows = (typeof arg1 === 'object' && arg1 !== null ? arg1.maxRows : arg2) || 100;
      return await converterEngine.previewCsv(inputPath, maxRows);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('batch-rename-preview', async (event, arg1, arg2) => {
    try {
      let files = typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.files : arg1;
      let rules = (typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.rules : arg2) || {};
      return await converterEngine.previewBatchRename(files, rules);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('batch-rename-execute', async (event, arg1, arg2) => {
    try {
      let files = typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.files : arg1;
      let rules = (typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.rules : arg2) || {};
      return await converterEngine.executeBatchRename(files, rules);
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('batch-hash', async (event, arg1, arg2) => {
    try {
      let files = typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.files : arg1;
      let algorithm = (typeof arg1 === 'object' && !Array.isArray(arg1) && arg1 !== null ? arg1.algorithm : arg2) || 'sha256';
      return await converterEngine.batchHash(files, algorithm);
    } catch (e) {
      return { error: e.message };
    }
  });

  // ==========================================
  // NEW IPC HANDLERS - Reports
  // ==========================================
  ipcMain.handle('generate-report', async (event, arg1, arg2, arg3) => {
    try {
      let type = typeof arg1 === 'object' && arg1 !== null ? arg1.type : arg1;
      let data = typeof arg1 === 'object' && arg1 !== null ? arg1.data : (arg3 || arg2);
      let rep;
      if (type === 'scan') rep = reportEngine.buildScanReport(data);
      else if (type === 'file') rep = reportEngine.buildFileAnalysisReport(data);
      else if (type === 'duplicate') rep = reportEngine.buildDuplicateReport(data);
      else if (type === 'forensic') rep = reportEngine.buildForensicReport(data);
      else if (type === 'hash') rep = reportEngine.buildHashVerificationReport(data);
      else rep = reportEngine.buildScanReport(data);
      return { success: true, report: rep };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('export-report-advanced', async (event, arg1, arg2) => {
    try {
      let reportData = typeof arg1 === 'object' && arg1 !== null && 'reportData' in arg1 ? arg1.reportData : (arg2 || arg1);
      let format = typeof arg1 === 'object' && arg1 !== null && 'format' in arg1 ? arg1.format : (typeof arg1 === 'string' ? arg1 : 'json');
      const ext = (format || 'json').toLowerCase();
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Report',
        defaultPath: `report.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      });
      if (!filePath) return { success: false, canceled: true };

      if (ext === 'json') await reportEngine.exportJson(reportData, filePath);
      else if (ext === 'csv') await reportEngine.exportCsv(reportData, filePath);
      else if (ext === 'txt') await reportEngine.exportTxt(reportData, filePath);
      else if (ext === 'pdf') await reportEngine.exportPdf(reportData, filePath);
      else if (ext === 'html') await reportEngine.exportHtml(reportData, filePath);

      return { success: true, filePath, path: filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ==========================================
  // NEW IPC HANDLERS - Settings & App Info
  // ==========================================
  ipcMain.handle('get-settings', () => {
    return appSettings;
  });
  ipcMain.handle('save-settings', (event, settings) => {
    appSettings = { ...appSettings, ...settings };
    writeIndex();
    return true;
  });
  ipcMain.handle('get-app-info', () => {
    return {
      version: app.getVersion(),
      creator: 'Uday Kiran Jammula',
      tagline: 'Digital File Intelligence',
      platform: process.platform,
      arch: process.arch,
      userData: app.getPath('userData'),
      appPath: app.getAppPath()
    };
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    frame: true,
    title: 'File DNA - Created by Uday Kiran Jammula',
    backgroundColor: '#090d16',
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenuBarVisibility(false);

  const indexPath = path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.on('close', () => {
    writeIndex();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  initializeStorage();
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  writeIndex();
  if (process.platform !== 'macOS') {
    app.quit();
  }
});