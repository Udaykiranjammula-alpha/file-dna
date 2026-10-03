const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let mainWindow = null;
let STORAGE_PATH = null;

// File DNA Central Index
let fileIndex = {
  files: new Map(),
  tags: new Map(),
  categories: new Map()
};

// Known File Signatures (Magic Bytes)
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

// Calculate SHA-256 and MD5 simultaneously in single stream
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

// Calculate Shannon Entropy (0.0 to 8.0 bits/byte)
function calculateForensicEntropy(filePath, fileSize) {
  return new Promise((resolve) => {
    try {
      const sampleSize = Math.min(fileSize, 4 * 1024 * 1024); // Up to 4MB sample
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

      // Forensic classification based on entropy
      let classification = 'Standard Binary';
      if (entropy === 0) classification = 'Zeroed / Sparse';
      else if (entropy < 3.5) classification = 'Plain Text / Structured Code';
      else if (entropy < 5.5) classification = 'Formatted Document / Structured Data';
      else if (entropy < 7.2) classification = 'Native Binary / Compiled Code';
      else classification = 'High Entropy (Compressed / Encrypted)';

      // 16-bucket byte density barcode for DNA visualizer
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
      console.error('Forensic entropy error:', err);
      resolve({ entropy: 0, classification: 'Unknown', barcode: new Array(16).fill(0) });
    }
  });
}

// Magic bytes detection
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

// Category mapping
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

// MIME type resolution
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

// Analyze text content for small files
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
    if (fs.existsSync(STORAGE_PATH)) {
      const raw = fs.readFileSync(STORAGE_PATH, 'utf8');
      const data = JSON.parse(raw);
      fileIndex.files = new Map(Object.entries(data.files || {}));
      rebuildIndexes();
    }
  } catch (err) {
    console.error('Storage initialization failed:', err);
  }
}

function writeIndex() {
  try {
    if (!STORAGE_PATH) return;
    const payload = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      files: Object.fromEntries(fileIndex.files)
    };
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(payload, null, 2), 'utf8');
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

    // Compute Cryptographic DNA & Forensic Entropy
    const hashes = await calculateHashes(filePath);
    const forensics = await calculateForensicEntropy(filePath, stat.size);
    const magic = inspectMagicBytes(filePath);
    const content = analyzeContent(filePath, ext, stat.size);

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

// Recursively scan directories
async function scanDirectory(dir, processedFiles = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          // Avoid scanning system/restricted directories
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scanDirectory(fullPath, processedFiles);
          }
        } else if (entry.isFile()) {
          const res = await processFile(fullPath);
          if (res) processedFiles.push(res);
        }
      } catch (e) {
        // Skip unreadable files
      }
    }
  } catch (err) {
    console.error(`Failed to scan dir ${dir}:`, err);
  }
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

// IPC Handlers
function registerIpcHandlers() {
  // 1. Import Files / Folders via Dialog
  ipcMain.handle('import-files', async () => {
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
        await scanDirectory(p, processed);
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
  });

  // 2. Process Dragged & Dropped Paths
  ipcMain.handle('process-paths', async (event, paths) => {
    if (!paths || !Array.isArray(paths)) return { success: false, count: 0 };
    const processed = [];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        if (fs.statSync(p).isDirectory()) {
          await scanDirectory(p, processed);
        } else {
          const item = await processFile(p);
          if (item) processed.push(item);
        }
      }
    }
    writeIndex();
    return { success: true, count: processed.length, totalIndexed: fileIndex.files.size };
  });

  // 3. Analyze specific file
  ipcMain.handle('analyze-file', async (event, filePath) => {
    let file = fileIndex.files.get(filePath);
    if (!file && fs.existsSync(filePath)) {
      file = await processFile(filePath);
      writeIndex();
    }
    return file || null;
  });

  // 4. Get File DNA (Deep forensic view)
  ipcMain.handle('get-file-dna', async (event, filePath) => {
    let file = fileIndex.files.get(filePath);
    if (!file && fs.existsSync(filePath)) {
      file = await processFile(filePath);
      writeIndex();
    }
    if (!file) return null;

    // Check duplicate status
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
  });

  // 5. Search files
  ipcMain.handle('search-files', async (event, { query = '', category = 'All' }) => {
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

    // Sort by modified desc
    results.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    return results;
  });

  // 6. Duplicate detection
  ipcMain.handle('duplicate-detection', async () => {
    return computeDuplicates();
  });

  // 7. Dashboard metrics
  ipcMain.handle('get-dashboard-data', async () => {
    return computeDashboard();
  });

  // 8. Open in Windows Explorer
  ipcMain.handle('reveal-in-explorer', async (event, filePath) => {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });

  // 9. Remove from Index
  ipcMain.handle('remove-from-index', async (event, filePath) => {
    const existed = fileIndex.files.delete(filePath);
    if (existed) {
      rebuildIndexes();
      writeIndex();
    }
    return existed;
  });

  // 10. Delete file safely to Recycle Bin
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

  // 11. Clear entire index
  ipcMain.handle('clear-index', async () => {
    fileIndex.files.clear();
    fileIndex.tags.clear();
    fileIndex.categories.clear();
    writeIndex();
    return true;
  });

  // 12. Export Report (JSON / CSV)
  ipcMain.handle('export-report', async (event, format = 'json') => {
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
        version: "1.0.0",
        creator: "Uday Kiran Jammula",
        generatedAt: new Date().toISOString(),
        summary: computeDashboard(),
        files: files
      }, null, 2);
      fs.writeFileSync(filePath, json, 'utf8');
    }

    return { success: true, filePath };
  });

  // Window Controls
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
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    frame: true,
    title: 'File DNA',
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