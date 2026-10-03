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
  }
};

contextBridge.exposeInMainWorld('fileDNA', api);
contextBridge.exposeInMainWorld('nexus', api);