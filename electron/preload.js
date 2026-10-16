const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // File operations
  files: {
    import: () => ipcRenderer.invoke('import-files'),
    processPaths: (paths) => ipcRenderer.invoke('process-paths', paths),
    analyze: (filePath) => ipcRenderer.invoke('analyze-file', filePath),
    getDNA: (filePath) => ipcRenderer.invoke('get-file-dna', filePath),
    search: (query, category) => ipcRenderer.invoke('search-files', { query, category }),
    getDuplicateDetection: () => ipcRenderer.invoke('duplicate-detection'),
    revealInExplorer: (filePath) => ipcRenderer.invoke('reveal-in-explorer', filePath),
    removeFromIndex: (filePath) => ipcRenderer.invoke('remove-from-index', filePath),
    deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
    clearIndex: () => ipcRenderer.invoke('clear-index'),
    exportReport: (format) => ipcRenderer.invoke('export-report', format)
  },

  // Dashboard / Metrics
  system: {
    getDashboardData: () => ipcRenderer.invoke('get-dashboard-data'),
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close')
  },

  // Export alias
  export: {
    report: (format) => ipcRenderer.invoke('export-report', format)
  },

  // Enhanced scanning
  scan: {
    start: (options) => ipcRenderer.invoke('scan-start', options),
    pause: () => ipcRenderer.invoke('scan-pause'),
    resume: () => ipcRenderer.invoke('scan-resume'),
    cancel: () => ipcRenderer.invoke('scan-cancel'),
    status: () => ipcRenderer.invoke('scan-status'),
    history: () => ipcRenderer.invoke('scan-history'),
    onProgress: (callback) => {
      ipcRenderer.on('scan-progress', (event, data) => callback(data));
    },
    onComplete: (callback) => {
      ipcRenderer.on('scan-complete', (event, data) => callback(data));
    },
    onCancelled: (callback) => {
      ipcRenderer.on('scan-cancelled', (event) => callback());
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('scan-progress');
      ipcRenderer.removeAllListeners('scan-complete');
      ipcRenderer.removeAllListeners('scan-cancelled');
    }
  },

  // Forensics
  forensics: {
    analyze: (filePath) => ipcRenderer.invoke('forensic-analyze', filePath),
    verifyHash: (filePath, expectedHash, algorithm) => ipcRenderer.invoke('verify-hash', filePath, expectedHash, algorithm),
    hexDump: (filePath, offset, length) => ipcRenderer.invoke('hex-dump', filePath, offset, length),
    textPreview: (filePath, maxBytes) => ipcRenderer.invoke('text-preview', filePath, maxBytes),
    checkSuspicious: (filePath) => ipcRenderer.invoke('check-suspicious', filePath)
  },

  // PDF Tools
  pdf: {
    createFromText: (text, options) => ipcRenderer.invoke('pdf-create-from-text', text, options),
    createFromImages: (imagePaths, options) => ipcRenderer.invoke('pdf-create-from-images', imagePaths, options),
    merge: (filePaths) => ipcRenderer.invoke('pdf-merge', filePaths),
    split: (filePath, ranges) => ipcRenderer.invoke('pdf-split', filePath, ranges),
    extractPages: (filePath, pageNumbers) => ipcRenderer.invoke('pdf-extract-pages', filePath, pageNumbers),
    reorder: (filePath, newOrder) => ipcRenderer.invoke('pdf-reorder', filePath, newOrder),
    rotate: (filePath, rotation, pageNumbers) => ipcRenderer.invoke('pdf-rotate', filePath, rotation, pageNumbers),
    deletePages: (filePath, pageNumbers) => ipcRenderer.invoke('pdf-delete-pages', filePath, pageNumbers),
    addWatermark: (filePath, text, options) => ipcRenderer.invoke('pdf-add-watermark', filePath, text, options),
    addPageNumbers: (filePath, options) => ipcRenderer.invoke('pdf-add-page-numbers', filePath, options),
    getMetadata: (filePath) => ipcRenderer.invoke('pdf-get-metadata', filePath),
    setMetadata: (filePath, metadata) => ipcRenderer.invoke('pdf-set-metadata', filePath, metadata),
    extractText: (filePath) => ipcRenderer.invoke('pdf-extract-text', filePath),
    getInfo: (filePath) => ipcRenderer.invoke('pdf-get-info', filePath),
    compress: (filePath) => ipcRenderer.invoke('pdf-compress', filePath),
    save: (buffer, defaultName) => ipcRenderer.invoke('pdf-save', buffer, defaultName)
  },

  // Metadata
  metadata: {
    extract: (filePath) => ipcRenderer.invoke('extract-metadata', filePath),
    checkPrivacy: (filePath) => ipcRenderer.invoke('check-privacy', filePath)
  },

  // Converter
  converter: {
    convertImage: (inputPath, outputPath, options) => ipcRenderer.invoke('convert-image', inputPath, outputPath, options),
    batchConvertImages: (files, outputDir, options) => ipcRenderer.invoke('batch-convert-images', files, outputDir, options),
    resizeImage: (inputPath, outputPath, width, height, options) => ipcRenderer.invoke('resize-image', inputPath, outputPath, width, height, options),
    compressImage: (inputPath, outputPath, quality) => ipcRenderer.invoke('compress-image', inputPath, outputPath, quality),
    getImageInfo: (inputPath) => ipcRenderer.invoke('get-image-info', inputPath),
    createZip: (inputPaths, outputPath, options) => ipcRenderer.invoke('create-zip', inputPaths, outputPath, options),
    extractZip: (archivePath, outputDir, options) => ipcRenderer.invoke('extract-zip', archivePath, outputDir, options),
    inspectArchive: (archivePath) => ipcRenderer.invoke('inspect-archive', archivePath),
    formatJson: (inputPath, outputPath) => ipcRenderer.invoke('format-json', inputPath, outputPath),
    previewCsv: (inputPath, maxRows) => ipcRenderer.invoke('preview-csv', inputPath, maxRows),
    batchRenamePreview: (files, rules) => ipcRenderer.invoke('batch-rename-preview', files, rules),
    batchRenameExecute: (files, rules) => ipcRenderer.invoke('batch-rename-execute', files, rules),
    batchHash: (files, algorithm) => ipcRenderer.invoke('batch-hash', files, algorithm)
  },

  // Reports
  reports: {
    generate: (type, format, data) => ipcRenderer.invoke('generate-report', type, format, data),
    exportAdvanced: (type, data) => ipcRenderer.invoke('export-report-advanced', type, data)
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('get-settings'),
    save: (settings) => ipcRenderer.invoke('save-settings', settings),
    getAppInfo: () => ipcRenderer.invoke('get-app-info')
  }
};

contextBridge.exposeInMainWorld('fileDNA', api);
contextBridge.exposeInMainWorld('nexus', api);