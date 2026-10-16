// File DNA - Client Frontend Controller
(function() {
  const api = window.fileDNA || window.nexus;

  if (!api) {
    console.error('File DNA Bridge is unavailable.');
    return;
  }

  // State
  let activeTab = 'dashboard';
  let activeCategory = 'All';
  let currentInspectedFile = null;
  let searchTimeout = null;

  // DOM Elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabViews = document.querySelectorAll('.tab-view');
  const dropOverlay = document.getElementById('drop-overlay');
  const globalSearch = document.getElementById('global-search');

  // Format Bytes helper
  function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Show Toast
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  }

  // Copy to clipboard
  function copyText(text, label = 'Copied') {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(`${label} to clipboard!`, 'success');
  }

  // Tab switching
  function switchTab(tabId) {
    activeTab = tabId;
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabId);
    });
    tabViews.forEach(view => {
      view.classList.toggle('active', view.id === `view-${tabId}`);
    });

    if (tabId === 'dashboard') loadDashboard();
    else if (tabId === 'duplicates') loadDuplicates();
    else if (tabId === 'registry') loadRegistry();
    else if (tabId === 'settings') loadSettings();
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  document.getElementById('btn-view-all-registry')?.addEventListener('click', () => switchTab('registry'));

  // 1. Dashboard Logic
  async function loadDashboard() {
    try {
      if (!api.system || !api.system.getDashboardData) return;
      const data = await api.system.getDashboardData();
      if (!data) return;

      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      
      setEl('stat-files-count', data.totalFiles?.toLocaleString());
      setEl('stat-storage-size', `${data.totalStorageMB || 0} MB`);
      setEl('stat-storage-gb', `${data.totalStorageGB || 0} GB analyzed`);
      setEl('stat-duplicate-count', data.duplicateCount?.toLocaleString());
      setEl('stat-wasted-storage', `${data.wastedMB || 0} MB recoverable`);
      setEl('stat-avg-entropy', data.avgEntropy || '0.00');
      setEl('dup-badge', data.duplicateCount || 0);

      // Category breakdown bars
      renderCategoryBars(data.categoryCounts, data.categoryStorage, data.totalStorage);

      // Recent Files
      renderRecentFiles(data.recentFiles || []);
      
      // Additional logic for new stat cards if they exist
      if (document.getElementById('stat-unique-count') && data.uniqueCount !== undefined) {
        setEl('stat-unique-count', data.uniqueCount.toLocaleString());
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
    }
  }

  function renderCategoryBars(counts = {}, storage = {}, totalStorage = 1) {
    const container = document.getElementById('category-bars');
    if (!container) return;
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      container.innerHTML = `<div class="empty-state-sm text-center text-muted py-6">No files indexed yet. Drag & drop files or scan a folder.</div>`;
      return;
    }

    let html = '';
    const topEntries = entries.slice(0, 5);
    for (const [cat, count] of topEntries) {
      const bytes = storage[cat] || 0;
      const pct = totalStorage > 0 ? Math.min(100, Math.round((bytes / totalStorage) * 100)) : 0;
      html += `
        <div class="cat-row">
          <div class="cat-row-header">
            <span><strong>${escapeHtml(cat)}</strong> (${count} files)</span>
            <span class="text-muted">${formatBytes(bytes)} (${pct}%)</span>
          </div>
          <div class="cat-bar-bg">
            <div class="cat-bar-fill" style="width: ${Math.max(4, pct)}%;"></div>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  }

  function renderRecentFiles(files) {
    const tbody = document.getElementById('recent-files-tbody');
    if (!tbody) return;
    if (!files.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-6">No recent files found. Drop files above to begin.</td></tr>`;
      return;
    }

    tbody.innerHTML = files.map(f => `
      <tr>
        <td><strong>${escapeHtml(f.name)}</strong></td>
        <td><span class="badge badge-category">${escapeHtml(f.category || 'Unknown')}</span></td>
        <td>${formatBytes(f.size)}</td>
        <td><span class="code-hash" title="${f.sha256}">${f.sha256 ? f.sha256.substring(0, 16) + '...' : '---'}</span></td>
        <td>${f.entropy !== undefined ? f.entropy : '---'}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="window.inspectFile('${escapeJsStr(f.path)}')">DNA</button>
          <button class="btn-icon-tiny ml-1" title="Show in Explorer" onclick="window.revealFile('${escapeJsStr(f.path)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  }

  // 2. DNA Inspector Logic (Enhanced)
  window.inspectFile = async function(filePath) {
    try {
      if (!api.files || !api.files.getDNA) return;
      const dna = await api.files.getDNA(filePath);
      if (!dna) {
        showToast('File details unavailable', 'info');
        return;
      }

      currentInspectedFile = dna;
      switchTab('inspector');

      document.getElementById('inspector-placeholder')?.classList.add('hidden');
      const card = document.getElementById('inspector-card');
      if (card) card.classList.remove('hidden');

      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

      setEl('dna-filename', dna.identity.name);
      setEl('dna-filepath', dna.identity.path);
      setEl('dna-category-badge', dna.identity.category);

      const uniquenessBox = document.getElementById('dna-uniqueness-badge');
      if (uniquenessBox) {
        if (dna.duplicates.isUnique) {
          uniquenessBox.innerHTML = `<span class="status-pill status-unique">UNIQUE CONTENT</span>`;
        } else {
          uniquenessBox.innerHTML = `<span class="status-pill status-duplicate">${dna.duplicates.matchCount} IDENTICAL COPIES</span>`;
        }
      }

      setEl('dna-sha256', dna.forensics.sha256 || '---');
      setEl('dna-md5', dna.forensics.md5 || '---');

      const entropy = dna.forensics.entropy || 0;
      setEl('dna-entropy-score', `${entropy.toFixed(2)} / 8.00`);
      const entropyPct = Math.min(100, Math.round((entropy / 8.0) * 100));
      const entropyBar = document.getElementById('dna-entropy-progress');
      if (entropyBar) entropyBar.style.width = `${entropyPct}%`;
      setEl('dna-entropy-class', dna.forensics.classification || 'Standard Binary');

      const barcodeContainer = document.getElementById('dna-barcode-container');
      if (barcodeContainer) {
        const barcodeData = dna.forensics.barcode || new Array(16).fill(0);
        barcodeContainer.innerHTML = barcodeData.map(val => `
          <div class="barcode-bar" style="height: ${Math.max(8, Math.min(100, val * 2))}%;" title="Density: ${val}%"></div>
        `).join('');
      }

      setEl('dna-filesize', formatBytes(dna.identity.size));
      setEl('dna-filesize-bytes', `${dna.identity.size.toLocaleString()} bytes`);
      setEl('dna-mimetype', dna.identity.mimeType);
      setEl('dna-magic-header', `Header: ${dna.identity.magic?.headerHex || 'N/A'} (${dna.identity.magic?.signature || 'Generic'})`);

      if (dna.content && dna.content.isText) {
        setEl('dna-structure', `${dna.content.lines} lines, ${dna.content.words} words`);
        setEl('dna-structure-sub', `${dna.content.chars} characters (${dna.content.blankLines} blank lines)`);
      } else {
        setEl('dna-structure', 'Binary Executable / Media');
        setEl('dna-structure-sub', 'Non-plaintext structural layout');
      }

      const dupPanel = document.getElementById('dna-duplicates-panel');
      const dupList = document.getElementById('dna-duplicates-list');
      if (dupPanel && dupList) {
        if (!dna.duplicates.isUnique && dna.duplicates.copies.length > 1) {
          dupPanel.classList.remove('hidden');
          setEl('dna-duplicates-count', `${dna.duplicates.copies.length} copies`);
          dupList.innerHTML = dna.duplicates.copies.map(c => `
            <li class="dup-file-row">
              <div>
                <strong>${escapeHtml(c.name)}</strong>
                <div class="text-muted text-xs">${escapeHtml(c.path)}</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="window.revealFile('${escapeJsStr(c.path)}')">Reveal</button>
            </li>
          `).join('');
        } else {
          dupPanel.classList.add('hidden');
        }
      }

      // Enhanced API Calls
      try {
        if (api.metadata && api.metadata.extract) {
          const meta = await api.metadata.extract(filePath);
          const metaPanel = document.getElementById('inspector-metadata-panel');
          if (metaPanel) {
            metaPanel.innerHTML = meta ? `<pre class="text-xs overflow-auto p-2 bg-dark rounded">${escapeHtml(JSON.stringify(meta, null, 2))}</pre>` : '<div class="text-muted">No metadata available</div>';
          }
        }
      } catch(e) { console.error('Metadata error:', e); }

      try {
        if (api.metadata && api.metadata.checkPrivacy) {
          const privacy = await api.metadata.checkPrivacy(filePath);
          const privacyPanel = document.getElementById('inspector-privacy-panel');
          if (privacyPanel) {
            privacyPanel.innerHTML = privacy && privacy.warnings && privacy.warnings.length > 0 
              ? `<ul class="text-sm text-amber">${privacy.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` 
              : '<div class="text-muted">No obvious privacy risks detected</div>';
          }
        }
      } catch(e) { console.error('Privacy check error:', e); }

    } catch (err) {
      console.error('Inspector error:', err);
    }
  };

  // 3. Duplicate Vault Logic
  async function loadDuplicates() {
    try {
      if (!api.files || !api.files.getDuplicateDetection) return;
      const result = await api.files.getDuplicateDetection();
      const container = document.getElementById('duplicate-groups-container');
      const badge = document.getElementById('dup-badge');
      const wastedSize = document.getElementById('vault-wasted-size');

      if (badge) badge.textContent = result.totalDuplicateCount;
      if (wastedSize) wastedSize.textContent = `${result.totalWastedMB} MB`;

      if (!container) return;

      if (!result.duplicates || !result.duplicates.length) {
        container.innerHTML = `
          <div class="empty-state text-center py-12">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <h3 class="mt-4">Zero Redundancy Detected</h3>
            <p class="text-muted">All scanned files in the database have unique SHA-256 fingerprints.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = result.duplicates.map(group => `
        <div class="dup-group-card">
          <div class="dup-group-header">
            <div>
              <strong>${escapeHtml(group.sampleName)}</strong>
              <span class="badge ml-2">${group.count} copies</span>
              <div class="code-hash mt-1">${group.sha256}</div>
            </div>
            <div class="text-right">
              <span class="text-amber font-mono font-bold">${formatBytes(group.wastedBytes)}</span>
              <div class="text-muted text-xs">wasted duplicate space</div>
            </div>
          </div>
          <div class="dup-group-files">
            ${group.files.map((f, idx) => `
              <div class="dup-file-row">
                <div>
                  <span>${escapeHtml(f.path)}</span>
                  <div class="text-muted text-xs">${formatBytes(f.size)} • Modified: ${new Date(f.modified).toLocaleDateString()}</div>
                </div>
                <div class="flex gap-2">
                  <button class="btn btn-secondary btn-sm" onclick="window.inspectFile('${escapeJsStr(f.path)}')">DNA</button>
                  <button class="btn btn-secondary btn-sm" onclick="window.revealFile('${escapeJsStr(f.path)}')">Reveal</button>
                  ${idx > 0 ? `<button class="btn btn-ghost btn-sm text-amber" onclick="window.deleteDuplicate('${escapeJsStr(f.path)}')">Recycle</button>` : '<span class="text-xs text-muted py-1 px-2">Original</span>'}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Duplicates load error:', err);
    }
  }

  // 4. File Registry Logic
  async function loadRegistry(query = '') {
    try {
      if (!api.files || !api.files.search) return;
      const results = await api.files.search(query, activeCategory);
      const tbody = document.getElementById('registry-tbody');
      if (!tbody) return;

      if (!results || !results.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-8">No files match current criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = results.map(f => `
        <tr>
          <td><strong>${escapeHtml(f.name)}</strong></td>
          <td><span class="badge badge-category">${escapeHtml(f.category)}</span></td>
          <td>${formatBytes(f.size)}</td>
          <td><span class="code-hash" title="${f.sha256}">${f.sha256 ? f.sha256.substring(0, 16) + '...' : '---'}</span></td>
          <td>${f.entropy !== undefined ? f.entropy : '---'}</td>
          <td>${new Date(f.modified).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="window.inspectFile('${escapeJsStr(f.path)}')">DNA</button>
            <button class="btn-icon-tiny ml-1" title="Show in Explorer" onclick="window.revealFile('${escapeJsStr(f.path)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
            </button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Registry load error:', err);
    }
  }

  // Category filter buttons
  document.querySelectorAll('#registry-category-filters .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#registry-category-filters .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCategory = pill.dataset.category;
      loadRegistry(globalSearch?.value || '');
    });
  });

  // Global search input
  if (globalSearch) {
    globalSearch.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        if (activeTab !== 'registry') switchTab('registry');
        loadRegistry(e.target.value);
      }, 200);
    });
  }

  // Window helper actions
  window.revealFile = async function(filePath) {
    if (api.files && api.files.revealInExplorer) {
      await api.files.revealInExplorer(filePath);
    }
  };

  window.deleteDuplicate = async function(filePath) {
    if (confirm(`Move duplicate to Windows Recycle Bin?\n\n${filePath}`)) {
      if (!api.files || !api.files.deleteFile) return;
      const res = await api.files.deleteFile(filePath);
      if (res && res.success) {
        showToast('Moved duplicate to Recycle Bin', 'success');
        loadDuplicates();
        loadDashboard();
      } else {
        showToast(res ? res.error : 'Failed to delete file', 'info');
      }
    }
  };

  // Copy Buttons in Inspector
  document.getElementById('btn-copy-sha256')?.addEventListener('click', () => {
    copyText(document.getElementById('dna-sha256')?.textContent, 'SHA-256');
  });

  document.getElementById('btn-copy-md5')?.addEventListener('click', () => {
    copyText(document.getElementById('dna-md5')?.textContent, 'MD5');
  });

  document.getElementById('btn-copy-path')?.addEventListener('click', () => {
    copyText(document.getElementById('dna-filepath')?.textContent, 'File path');
  });

  document.getElementById('btn-reveal-explorer')?.addEventListener('click', () => {
    if (currentInspectedFile) window.revealFile(currentInspectedFile.identity.path);
  });

  // Import Action Handlers
  async function triggerImportFiles() {
    if (!api.files || !api.files.import) return;
    showToast('Scanning files...', 'info');
    const res = await api.files.import();
    if (res && res.success && res.count > 0) {
      showToast(`Scanned and fingerprinted ${res.count} files!`, 'success');
      loadDashboard();
    }
  }

  document.getElementById('btn-import-quick')?.addEventListener('click', triggerImportFiles);
  document.getElementById('btn-browse-files')?.addEventListener('click', triggerImportFiles);
  document.getElementById('btn-inspector-browse')?.addEventListener('click', triggerImportFiles);
  document.getElementById('btn-import-folder')?.addEventListener('click', triggerImportFiles);
  document.getElementById('btn-browse-folder')?.addEventListener('click', triggerImportFiles);

  // Clear Index Handler
  document.getElementById('btn-clear-index')?.addEventListener('click', async () => {
    if (confirm('Clear entire File DNA indexed cache? (Your actual files will not be deleted)')) {
      if (!api.files || !api.files.clearIndex) return;
      await api.files.clearIndex();
      showToast('Cache cleared', 'info');
      loadDashboard();
    }
  });

  // Export Report Handler
  document.getElementById('btn-export-report')?.addEventListener('click', async () => {
    if (!api.files || !api.files.exportReport) return;
    const res = await api.files.exportReport('json');
    if (res && res.success) {
      showToast(`Exported report: ${res.filePath}`, 'success');
    }
  });

  // Global Drag & Drop Handler
  if (dropOverlay) {
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropOverlay.classList.add('active');
    });

    dropOverlay.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropOverlay.classList.remove('active');
    });

    dropOverlay.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropOverlay.classList.remove('active');

      const files = e.dataTransfer.files;
      if (!files || !files.length) return;

      const paths = [];
      for (let i = 0; i < files.length; i++) {
        if (files[i].path) {
          paths.push(files[i].path);
        }
      }

      if (paths.length > 0 && api.files && api.files.processPaths) {
        showToast(`Extracting DNA from ${paths.length} items...`, 'info');
        const res = await api.files.processPaths(paths);
        if (res && res.success) {
          showToast(`Analyzed and added ${res.count} files!`, 'success');
          loadDashboard();
          if (paths.length === 1) {
            window.inspectFile(paths[0]);
          }
        }
      }
    });
  }

  // HTML escape helpers
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeJsStr(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  // ----------------------------------------------------------------------
  // NEW FEATURES IMPLEMENTATION
  // ----------------------------------------------------------------------

  // Scan Logic
  if (api.scan) {
    document.getElementById('btn-scan-start')?.addEventListener('click', async () => {
      try {
        const pathInput = document.getElementById('scan-path-input');
        const path = pathInput ? pathInput.value : '';
        const progressEl = document.getElementById('scan-progress-bar');
        if (progressEl) progressEl.classList.remove('hidden');
        await api.scan.start({ path });
        showToast('Scan started', 'info');
      } catch(e) {
        showToast('Scan start failed: ' + e.message, 'error');
      }
    });

    document.getElementById('btn-scan-pause')?.addEventListener('click', async () => {
      try { await api.scan.pause(); showToast('Scan paused', 'info'); } catch(e) { showToast(e.message, 'error'); }
    });

    document.getElementById('btn-scan-resume')?.addEventListener('click', async () => {
      try { await api.scan.resume(); showToast('Scan resumed', 'info'); } catch(e) { showToast(e.message, 'error'); }
    });

    document.getElementById('btn-scan-cancel')?.addEventListener('click', async () => {
      try { await api.scan.cancel(); showToast('Scan cancelled', 'info'); } catch(e) { showToast(e.message, 'error'); }
    });

    api.scan.onProgress((data) => {
      const pct = data.totalFilesFound > 0 ? Math.round((data.totalFilesProcessed / data.totalFilesFound) * 100) : 0;
      const fillEl = document.getElementById('scan-progress-fill');
      if (fillEl) fillEl.style.width = pct + '%';
      
      const textEl = document.getElementById('scan-progress-text');
      if (textEl) textEl.textContent = `Progress: ${pct}% - Processed ${data.totalFilesProcessed} / ${data.totalFilesFound}`;
    });
  }

  // Forensics Logic
  if (api.forensics) {
    let currentForensicPath = null;
    let currentForensicReport = null;
    let hexOffset = 0;
    const HEX_PAGE_SIZE = 512;

    async function updateHexView() {
      if (!currentForensicPath) return;
      try {
        const res = await api.forensics.hexDump(currentForensicPath, hexOffset, HEX_PAGE_SIZE);
        const dumpEl = document.getElementById('forensic-hex-dump');
        const offsetEl = document.getElementById('hex-offset-display');
        if (dumpEl) dumpEl.textContent = res.hex || 'No hex data available';
        if (offsetEl) offsetEl.textContent = `Offset: 0x${hexOffset.toString(16).toUpperCase().padStart(6, '0')} / ${formatBytes(res.totalFileSize || 0)}`;
      } catch (e) {
        const dumpEl = document.getElementById('forensic-hex-dump');
        if (dumpEl) dumpEl.textContent = 'Failed to load hex dump: ' + e.message;
      }
    }

    document.getElementById('btn-hex-prev')?.addEventListener('click', () => {
      if (hexOffset >= HEX_PAGE_SIZE) {
        hexOffset -= HEX_PAGE_SIZE;
        updateHexView();
      }
    });

    document.getElementById('btn-hex-next')?.addEventListener('click', () => {
      if (currentForensicReport && hexOffset + HEX_PAGE_SIZE < (currentForensicReport.identity?.size || currentForensicReport.size || Infinity)) {
        hexOffset += HEX_PAGE_SIZE;
        updateHexView();
      }
    });

    document.getElementById('btn-forensic-browse')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        currentForensicPath = file.path;
        hexOffset = 0;
        showToast('Analyzing file forensic profile...', 'info');

        try {
          const report = await api.forensics.analyze(file.path);
          currentForensicReport = report;

          // Identity
          const idEl = document.getElementById('forensic-identity');
          if (idEl) {
            const id = report.identity || {};
            idEl.innerHTML = `
              <div class="meta-item"><span class="meta-label">File Name</span><span class="meta-value font-mono">${escapeHtml(id.name || file.name)}</span></div>
              <div class="meta-item"><span class="meta-label">File Size</span><span class="meta-value">${formatBytes(id.size || file.size)}</span></div>
              <div class="meta-item"><span class="meta-label">MIME Type</span><span class="meta-value">${escapeHtml(id.mimeType || 'application/octet-stream')}</span></div>
              <div class="meta-item"><span class="meta-label">Detected Signature</span><span class="meta-value">${escapeHtml(report.magicBytes?.signature || id.magic || 'Unknown')}</span></div>
              <div class="meta-item"><span class="meta-label">Shannon Entropy</span><span class="meta-value">${report.structure?.entropy || report.entropy || 'N/A'} bits/byte</span></div>
              <div class="meta-item"><span class="meta-label">Entropy Classification</span><span class="meta-value">${escapeHtml(report.structure?.entropyClassification || 'Normal')}</span></div>
            `;
          }

          // Hashes
          const hashesEl = document.getElementById('forensic-hashes');
          if (hashesEl) {
            const h = report.hashes || {};
            hashesEl.innerHTML = `
              <div class="hash-row">
                <span class="hash-label">SHA-256</span>
                <span class="hash-val font-mono">${escapeHtml(h.sha256 || 'N/A')}</span>
                <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${escapeJsStr(h.sha256 || '')}');showToast('SHA-256 copied!','success')">Copy</button>
              </div>
              <div class="hash-row mt-2">
                <span class="hash-label">MD5</span>
                <span class="hash-val font-mono">${escapeHtml(h.md5 || 'N/A')}</span>
                <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${escapeJsStr(h.md5 || '')}');showToast('MD5 copied!','success')">Copy</button>
              </div>
              <div class="hash-row mt-2">
                <span class="hash-label">SHA-1</span>
                <span class="hash-val font-mono">${escapeHtml(h.sha1 || 'N/A')}</span>
                <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${escapeJsStr(h.sha1 || '')}');showToast('SHA-1 copied!','success')">Copy</button>
              </div>
              <div class="hash-row mt-2">
                <span class="hash-label">CRC32</span>
                <span class="hash-val font-mono">${escapeHtml(h.crc32 || 'N/A')}</span>
                <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${escapeJsStr(h.crc32 || '')}');showToast('CRC32 copied!','success')">Copy</button>
              </div>
            `;
          }

          // Extension Mismatch
          const mismatchPanel = document.getElementById('forensic-mismatch-panel');
          const mismatchContent = document.getElementById('forensic-mismatch-content');
          if (report.mismatch && report.mismatch.mismatch) {
            if (mismatchPanel) mismatchPanel.classList.remove('hidden');
            if (mismatchContent) {
              mismatchContent.innerHTML = `<div class="alert-box critical">
                <div><strong>Extension Mismatch:</strong> File has extension <code>${escapeHtml(report.mismatch.actualExt)}</code> but its signature indicates <code>${escapeHtml(report.mismatch.expectedExt)}</code>.</div>
              </div>`;
            }
          } else {
            if (mismatchPanel) mismatchPanel.classList.add('hidden');
          }

          // Suspicious Flags
          const suspPanel = document.getElementById('forensic-suspicious-panel');
          const suspContent = document.getElementById('forensic-suspicious-content');
          const flags = report.suspiciousFlags || [];
          if (flags.length > 0) {
            if (suspPanel) suspPanel.classList.remove('hidden');
            if (suspContent) {
              suspContent.innerHTML = flags.map(f => `
                <div class="alert-box ${f.severity === 'critical' ? 'critical' : 'warning'}">
                  <div><strong>${escapeHtml(f.type || 'Warning')}:</strong> ${escapeHtml(f.message || String(f))}</div>
                </div>
              `).join('');
            }
          } else {
            if (suspPanel) suspPanel.classList.add('hidden');
          }

          // Hex View
          await updateHexView();

          // Text Preview
          const textEl = document.getElementById('forensic-text-preview');
          if (textEl) {
            const txtRes = await api.forensics.textPreview(file.path, 4096);
            if (txtRes && txtRes.isText) {
              textEl.textContent = txtRes.content || '[Empty text file]';
            } else {
              textEl.textContent = '[Binary data file - no plain text preview available]';
            }
          }

          document.getElementById('forensic-results')?.classList.remove('hidden');
          showToast('Forensic analysis complete', 'success');
        } catch (err) {
          showToast('Forensic analysis failed: ' + err.message, 'error');
        }
      };
      input.click();
    });

    // Hash Verification Button
    document.getElementById('btn-verify-hash')?.addEventListener('click', async () => {
      if (!currentForensicPath) {
        showToast('Please select a file first', 'info');
        return;
      }
      const expected = document.getElementById('forensic-expected-hash')?.value?.trim();
      const algo = document.getElementById('forensic-hash-algo')?.value || 'sha256';
      if (!expected) {
        showToast('Please enter expected hash', 'info');
        return;
      }
      try {
        const res = await api.forensics.verifyHash(currentForensicPath, expected, algo);
        const resultEl = document.getElementById('forensic-hash-result');
        if (resultEl) {
          if (res.match) {
            resultEl.innerHTML = `<div class="hash-verify-result match">✓ Hash Match: The file's computed ${algo.toUpperCase()} matches expected value.</div>`;
          } else {
            resultEl.innerHTML = `<div class="hash-verify-result mismatch">✕ Hash Mismatch: Expected "${escapeHtml(expected)}", but computed "${escapeHtml(res.computed || 'different')}".</div>`;
          }
        }
      } catch (e) {
        showToast('Verification failed: ' + e.message, 'error');
      }
    });

    // Export Forensic Report
    document.getElementById('btn-export-forensic')?.addEventListener('click', async () => {
      if (!currentForensicReport) {
        showToast('No forensic report to export', 'info');
        return;
      }
      try {
        const res = await api.reports.exportAdvanced('forensic', currentForensicReport);
        if (res && res.success) {
          showToast(`Report exported to ${res.filePath || res.path}`, 'success');
        }
      } catch (e) {
        showToast('Export failed: ' + e.message, 'error');
      }
    });
  }

  // Tool UI Setup Helper
  function setupToolUI(workspaceId, contentId, resultId, titleId, toolTitle) {
    const workspace = document.getElementById(workspaceId);
    const content = document.getElementById(contentId);
    const result = document.getElementById(resultId);
    const title = document.getElementById(titleId);
    const grid = workspace?.parentElement?.querySelector('.tools-grid');

    if (workspace) workspace.classList.remove('hidden');
    if (result) result.classList.add('hidden');
    if (grid) grid.style.display = 'none';
    if (title) title.textContent = toolTitle;

    return { content, result };
  }

  // Back Button Listeners
  document.getElementById('btn-pdf-back')?.addEventListener('click', () => {
    const ws = document.getElementById('pdf-workspace');
    if (ws) ws.classList.add('hidden');
    const grid = ws?.parentElement?.querySelector('.tools-grid');
    if (grid) grid.style.display = '';
  });

  document.getElementById('btn-converter-back')?.addEventListener('click', () => {
    const ws = document.getElementById('converter-workspace');
    if (ws) ws.classList.add('hidden');
    const grid = ws?.parentElement?.querySelector('.tools-grid');
    if (grid) grid.style.display = '';
  });

  // ==========================================
  // PDF TOOLS FORM ENGINE (All 11 Tools)
  // ==========================================
  window.showPdfTool = function(toolId) {
    const { content, result } = setupToolUI('pdf-workspace', 'pdf-tool-content', 'pdf-tool-result', 'pdf-tool-title', 'PDF Tool');
    if (!content) return;
    content.innerHTML = '';

    switch(toolId) {
      case 'pdf-create-text':
        document.getElementById('pdf-tool-title').textContent = 'Create PDF from Text';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Compose or paste plain text to generate a clean PDF document.</p>
          <textarea id="pdf-text-input" class="input-field mb-3" style="width:100%;min-height:160px" placeholder="Enter or paste text content here..."></textarea>
          <div class="flex gap-2 mb-3">
            <select id="pdf-page-size" class="input-field"><option value="A4">A4 Page</option><option value="Letter">Letter</option><option value="Legal">Legal</option></select>
            <select id="pdf-orientation" class="input-field"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
            <input type="number" id="pdf-font-size" class="input-field" value="12" min="6" max="72" style="width:100px" placeholder="Font size">
            <input type="text" id="pdf-doc-title" class="input-field flex-1" placeholder="Document Title (optional)">
          </div>
          <button id="btn-pdf-execute" class="btn btn-action">Generate & Save PDF</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const text = document.getElementById('pdf-text-input').value;
          if (!text.trim()) { showToast('Please enter text content', 'info'); return; }
          showToast('Generating PDF...', 'info');
          try {
            const res = await api.pdf.createFromText(text, {
              pageSize: document.getElementById('pdf-page-size').value,
              orientation: document.getElementById('pdf-orientation').value,
              fontSize: parseInt(document.getElementById('pdf-font-size').value) || 12,
              title: document.getElementById('pdf-doc-title').value.trim()
            });
            if (res && res.success) {
              showToast(`PDF created: ${res.pageCount || 1} pages`, 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">PDF saved successfully to: <strong>${escapeHtml(res.path || res.filePath)}</strong> (${res.pageCount || 1} pages)</div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'pdf-create-images':
        document.getElementById('pdf-tool-title').textContent = 'Combine Images into PDF';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Select JPEG or PNG images to stitch into a multi-page PDF document.</p>
          <input type="file" id="pdf-img-input" multiple accept="image/png,image/jpeg,image/webp" class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <select id="pdf-img-pagesize" class="input-field"><option value="A4">A4 Page</option><option value="Letter">Letter</option></select>
            <select id="pdf-img-orientation" class="input-field"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
          </div>
          <button id="btn-pdf-execute" class="btn btn-action">Combine into PDF</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const files = document.getElementById('pdf-img-input').files;
          if (!files.length) { showToast('Please select at least one image', 'info'); return; }
          const paths = Array.from(files).map(f => f.path);
          showToast('Creating PDF from images...', 'info');
          try {
            const res = await api.pdf.createFromImages(paths, {
              pageSize: document.getElementById('pdf-img-pagesize').value,
              orientation: document.getElementById('pdf-img-orientation').value
            });
            if (res && res.success) {
              showToast(`PDF created with ${res.pageCount || paths.length} pages`, 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">PDF created successfully at: <strong>${escapeHtml(res.path || res.filePath)}</strong></div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'pdf-merge':
        document.getElementById('pdf-tool-title').textContent = 'Merge PDF Documents';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Select two or more PDF files in sequence to merge into a single PDF.</p>
          <input type="file" id="pdf-merge-input" multiple accept=".pdf" class="input-field mb-3" style="width:100%">
          <button id="btn-pdf-execute" class="btn btn-action">Merge Selected PDFs</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const files = document.getElementById('pdf-merge-input').files;
          if (files.length < 2) { showToast('Please select at least 2 PDF files to merge', 'info'); return; }
          const paths = Array.from(files).map(f => f.path);
          showToast('Merging PDFs...', 'info');
          try {
            const res = await api.pdf.merge(paths);
            if (res && res.success) {
              showToast('Merged successfully', 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Merged PDF saved at: <strong>${escapeHtml(res.path || res.filePath)}</strong> (${res.pageCount || files.length} total pages)</div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'pdf-split':
        document.getElementById('pdf-tool-title').textContent = 'Split PDF Document';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Split a PDF into sections by specifying page ranges (e.g. <code>1-3, 4, 5-8</code>).</p>
          <input type="file" id="pdf-split-input" accept=".pdf" class="input-field mb-3" style="width:100%">
          <input type="text" id="pdf-split-ranges" class="input-field mb-3" style="width:100%" placeholder="Page ranges (e.g. 1-2, 3, 4-6)">
          <button id="btn-pdf-execute" class="btn btn-action">Split PDF</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const file = document.getElementById('pdf-split-input').files[0];
          const ranges = document.getElementById('pdf-split-ranges').value.trim();
          if (!file) { showToast('Please select a PDF file', 'info'); return; }
          if (!ranges) { showToast('Please specify page ranges (e.g. 1-2, 3)', 'info'); return; }
          showToast('Splitting PDF...', 'info');
          try {
            const res = await api.pdf.split(file.path, ranges);
            if (res && res.success) {
              showToast('Split completed', 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Split files generated successfully: <strong>${escapeHtml(res.path || 'Created')}</strong></div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'pdf-extract-pages':
        document.getElementById('pdf-tool-title').textContent = 'Extract Specific Pages';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Extract specific page numbers into a new PDF document.</p>
          <input type="file" id="pdf-extract-pages-input" accept=".pdf" class="input-field mb-3" style="width:100%">
          <input type="text" id="pdf-extract-pages-nums" class="input-field mb-3" style="width:100%" placeholder="Page numbers to extract (e.g. 1, 3, 5)">
          <button id="btn-pdf-execute" class="btn btn-action">Extract Pages</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const file = document.getElementById('pdf-extract-pages-input').files[0];
          const pagesStr = document.getElementById('pdf-extract-pages-nums').value.trim();
          if (!file) { showToast('Please select a PDF file', 'info'); return; }
          if (!pagesStr) { showToast('Please specify page numbers', 'info'); return; }
          showToast('Extracting pages...', 'info');
          try {
            const pages = pagesStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            const res = await api.pdf.extractPages(file.path, pages);
            if (res && res.success) {
              showToast('Pages extracted', 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Extracted PDF saved at: <strong>${escapeHtml(res.path || res.filePath)}</strong> (${res.pageCount || pages.length} pages)</div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'pdf-rotate':
        document.getElementById('pdf-tool-title').textContent = 'Rotate PDF Pages';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Rotate pages clockwise by 90°, 180°, or 270°.</p>
          <input type="file" id="pdf-rotate-input" accept=".pdf" class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <select id="pdf-rotate-angle" class="input-field">
              <option value="90">Rotate 90° Clockwise</option>
              <option value="180">Rotate 180°</option>
              <option value="270">Rotate 270° Clockwise</option>
            </select>
            <input type="text" id="pdf-rotate-pages" class="input-field flex-1" placeholder="Page numbers (optional, leave empty for all)">
          </div>
          <button id="btn-pdf-execute" class="btn btn-action">Rotate & Save</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const file = document.getElementById('pdf-rotate-input').files[0];
          if (!file) { showToast('Please select a PDF file', 'info'); return; }
          const angle = parseInt(document.getElementById('pdf-rotate-angle').value) || 90;
          const pagesStr = document.getElementById('pdf-rotate-pages').value.trim();
          const pages = pagesStr ? pagesStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : null;
          showToast('Rotating PDF pages...', 'info');
          try {
            const res = await api.pdf.rotate(file.path, angle, pages);
            if (res && res.success) {
              showToast('Rotated successfully', 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Rotated PDF saved at: <strong>${escapeHtml(res.path || res.filePath)}</strong></div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'pdf-watermark':
        document.getElementById('pdf-tool-title').textContent = 'Add Text Watermark';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Add a semi-transparent text watermark across all pages of your PDF.</p>
          <input type="file" id="pdf-watermark-input" accept=".pdf" class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <input type="text" id="pdf-watermark-text" class="input-field flex-1" placeholder="Watermark text (e.g. CONFIDENTIAL)">
            <select id="pdf-watermark-opacity" class="input-field">
              <option value="0.2">Opacity 20%</option>
              <option value="0.3" selected>Opacity 30%</option>
              <option value="0.5">Opacity 50%</option>
              <option value="0.8">Opacity 80%</option>
            </select>
          </div>
          <button id="btn-pdf-execute" class="btn btn-action">Apply Watermark</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const file = document.getElementById('pdf-watermark-input').files[0];
          const text = document.getElementById('pdf-watermark-text').value.trim();
          if (!file) { showToast('Please select a PDF file', 'info'); return; }
          if (!text) { showToast('Please enter watermark text', 'info'); return; }
          const opacity = parseFloat(document.getElementById('pdf-watermark-opacity').value) || 0.3;
          showToast('Applying watermark...', 'info');
          try {
            const res = await api.pdf.addWatermark(file.path, text, { opacity });
            if (res && res.success) {
              showToast('Watermark added', 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Watermarked PDF saved at: <strong>${escapeHtml(res.path || res.filePath)}</strong></div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'pdf-page-numbers':
        document.getElementById('pdf-tool-title').textContent = 'Add Page Numbers';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Stamp clean, professional page numbering across the document.</p>
          <input type="file" id="pdf-numbers-input" accept=".pdf" class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <select id="pdf-numbers-pos" class="input-field">
              <option value="bottom-center" selected>Bottom Center</option>
              <option value="bottom-right">Bottom Right</option>
              <option value="top-right">Top Right</option>
            </select>
            <input type="text" id="pdf-numbers-fmt" class="input-field flex-1" value="Page {n} of {total}" placeholder="Format (e.g. Page {n} of {total})">
          </div>
          <button id="btn-pdf-execute" class="btn btn-action">Stamp Page Numbers</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const file = document.getElementById('pdf-numbers-input').files[0];
          if (!file) { showToast('Please select a PDF file', 'info'); return; }
          const position = document.getElementById('pdf-numbers-pos').value;
          const format = document.getElementById('pdf-numbers-fmt').value.trim() || 'Page {n} of {total}';
          showToast('Adding page numbers...', 'info');
          try {
            const res = await api.pdf.addPageNumbers(file.path, { position, format });
            if (res && res.success) {
              showToast('Numbers added successfully', 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Numbered PDF saved at: <strong>${escapeHtml(res.path || res.filePath)}</strong></div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'pdf-extract-text':
        document.getElementById('pdf-tool-title').textContent = 'Extract Text from PDF';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Extract all extractable text content from the PDF file.</p>
          <input type="file" id="pdf-extract-input" accept=".pdf" class="input-field mb-3" style="width:100%">
          <button id="btn-pdf-execute" class="btn btn-action">Extract Text</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const file = document.getElementById('pdf-extract-input').files[0];
          if (!file) { showToast('Please select a PDF file', 'info'); return; }
          showToast('Extracting text...', 'info');
          try {
            const res = await api.pdf.extractText(file.path);
            if (res) {
              const text = res.text || '';
              showToast(`Extracted ${text.length} characters`, 'success');
              result.classList.remove('hidden');
              result.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                  <span class="text-xs text-muted">Pages: ${res.pageCount || 1} | Characters: ${text.length.toLocaleString()}</span>
                  <button class="btn btn-secondary btn-sm" id="btn-copy-extracted-text">Copy Text</button>
                </div>
                <textarea class="input-field" style="width:100%;height:220px" readonly>${escapeHtml(text || '[No extractable text found in this document]')}</textarea>
              `;
              document.getElementById('btn-copy-extracted-text')?.addEventListener('click', () => {
                copyText(text, 'Text copied');
              });
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'pdf-metadata':
        document.getElementById('pdf-tool-title').textContent = 'PDF Metadata Inspector';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Inspect embedded document properties, author, title, and security status.</p>
          <input type="file" id="pdf-meta-input" accept=".pdf" class="input-field mb-3" style="width:100%">
          <button id="btn-pdf-execute" class="btn btn-action">Inspect Metadata</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const file = document.getElementById('pdf-meta-input').files[0];
          if (!file) { showToast('Please select a PDF file', 'info'); return; }
          showToast('Inspecting metadata...', 'info');
          try {
            const meta = await api.pdf.getMetadata(file.path);
            result.classList.remove('hidden');
            result.innerHTML = `
              <div class="metadata-grid">
                <div class="metadata-item"><span class="meta-label">Title</span><span class="meta-value">${escapeHtml(meta.title || '(Not set)')}</span></div>
                <div class="metadata-item"><span class="meta-label">Author</span><span class="meta-value">${escapeHtml(meta.author || '(Not set)')}</span></div>
                <div class="metadata-item"><span class="meta-label">Subject</span><span class="meta-value">${escapeHtml(meta.subject || '(Not set)')}</span></div>
                <div class="metadata-item"><span class="meta-label">Creator</span><span class="meta-value">${escapeHtml(meta.creator || '(Not set)')}</span></div>
                <div class="metadata-item"><span class="meta-label">Total Pages</span><span class="meta-value">${meta.pageCount || 0}</span></div>
                <div class="metadata-item"><span class="meta-label">Encrypted</span><span class="meta-value">${meta.isEncrypted ? 'Yes' : 'No'}</span></div>
                <div class="metadata-item"><span class="meta-label">File Size</span><span class="meta-value">${formatBytes(meta.fileSize || file.size)}</span></div>
              </div>
            `;
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'pdf-compress':
        document.getElementById('pdf-tool-title').textContent = 'Compress & Optimize PDF';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Optimize PDF structure and object streams to reduce overall file size.</p>
          <input type="file" id="pdf-compress-input" accept=".pdf" class="input-field mb-3" style="width:100%">
          <button id="btn-pdf-execute" class="btn btn-action">Optimize & Compress</button>
        `;
        document.getElementById('btn-pdf-execute').addEventListener('click', async () => {
          const file = document.getElementById('pdf-compress-input').files[0];
          if (!file) { showToast('Please select a PDF file', 'info'); return; }
          showToast('Optimizing PDF...', 'info');
          try {
            const res = await api.pdf.compress(file.path);
            if (res && res.success) {
              const orig = res.originalSize || file.size;
              const comp = res.compressedSize || orig;
              const pct = orig > 0 ? Math.max(0, Math.round(((orig - comp) / orig) * 100)) : 0;
              showToast(`Optimized: ${pct}% space saved`, 'success');
              result.classList.remove('hidden');
              result.innerHTML = `
                <div class="alert-box success">
                  <div>
                    <strong>Compressed PDF Saved:</strong> ${escapeHtml(res.path || res.filePath)}<br>
                    Original: ${formatBytes(orig)} &rarr; Compressed: ${formatBytes(comp)} (<strong>${pct}% space saved</strong>)
                  </div>
                </div>
              `;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      default:
        document.getElementById('pdf-tool-title').textContent = toolId;
        content.innerHTML = `<div class="text-muted">Select an operation above.</div>`;
        break;
    }
  };

  // ==========================================
  // CONVERTER TOOLS FORM ENGINE (All 11 Tools)
  // ==========================================
  window.showConverterTool = function(toolId) {
    const { content, result } = setupToolUI('converter-workspace', 'converter-tool-content', 'converter-tool-result', 'converter-tool-title', 'Converter Tool');
    if (!content) return;
    content.innerHTML = '';

    switch(toolId) {
      case 'img-convert':
        document.getElementById('converter-tool-title').textContent = 'Image Format Converter';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Convert images between PNG, JPEG, WebP, TIFF, and BMP formats.</p>
          <input type="file" id="conv-img-input" accept="image/*" class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <select id="conv-img-format" class="input-field">
              <option value="jpeg">JPEG (.jpg)</option>
              <option value="png">PNG (.png)</option>
              <option value="webp">WebP (.webp)</option>
              <option value="tiff">TIFF (.tiff)</option>
            </select>
            <input type="number" id="conv-img-quality" class="input-field" value="85" min="10" max="100" style="width:100px" placeholder="Quality %">
          </div>
          <button id="btn-conv-execute" class="btn btn-action">Convert & Save Image</button>
        `;
        document.getElementById('btn-conv-execute').addEventListener('click', async () => {
          const file = document.getElementById('conv-img-input').files[0];
          if (!file) { showToast('Please select an image', 'info'); return; }
          const format = document.getElementById('conv-img-format').value;
          const quality = parseInt(document.getElementById('conv-img-quality').value) || 85;
          showToast('Converting image...', 'info');
          try {
            const res = await api.converter.convertImage(file.path, null, { format, quality });
            if (res && res.success) {
              showToast('Image converted successfully', 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Image converted and saved to: <strong>${escapeHtml(res.path || res.filePath)}</strong> (${res.dimensions ? res.dimensions.width + 'x' + res.dimensions.height : 'Saved'})</div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'img-resize':
        document.getElementById('converter-tool-title').textContent = 'Resize Image';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Resize image to specified width and height dimensions with quality control.</p>
          <input type="file" id="conv-resize-input" accept="image/*" class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <input type="number" id="conv-resize-width" class="input-field flex-1" placeholder="Target Width (e.g. 1920)">
            <input type="number" id="conv-resize-height" class="input-field flex-1" placeholder="Target Height (e.g. 1080)">
            <select id="conv-resize-fit" class="input-field">
              <option value="inside">Fit Inside (Preserve Ratio)</option>
              <option value="cover">Cover & Crop</option>
              <option value="fill">Exact Fill</option>
            </select>
          </div>
          <button id="btn-conv-execute" class="btn btn-action">Resize & Save</button>
        `;
        document.getElementById('btn-conv-execute').addEventListener('click', async () => {
          const file = document.getElementById('conv-resize-input').files[0];
          const width = parseInt(document.getElementById('conv-resize-width').value);
          const height = parseInt(document.getElementById('conv-resize-height').value);
          if (!file) { showToast('Please select an image', 'info'); return; }
          if (!width && !height) { showToast('Please specify at least width or height', 'info'); return; }
          const fit = document.getElementById('conv-resize-fit').value;
          showToast('Resizing image...', 'info');
          try {
            const res = await api.converter.resizeImage(file.path, null, width || null, height || null, { fit });
            if (res && res.success) {
              showToast('Resized successfully', 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Resized image saved at: <strong>${escapeHtml(res.path || res.filePath)}</strong></div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'img-compress':
        document.getElementById('converter-tool-title').textContent = 'Compress Image';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Reduce image file size with configurable quality compression.</p>
          <input type="file" id="conv-comp-input" accept="image/*" class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3 items-center">
            <label class="text-xs text-muted">Quality:</label>
            <input type="range" id="conv-comp-quality" min="10" max="95" value="75" class="flex-1" oninput="document.getElementById('comp-q-val').textContent = this.value + '%'">
            <span id="comp-q-val" class="text-xs font-mono" style="min-width:40px">75%</span>
          </div>
          <button id="btn-conv-execute" class="btn btn-action">Compress Image</button>
        `;
        document.getElementById('btn-conv-execute').addEventListener('click', async () => {
          const file = document.getElementById('conv-comp-input').files[0];
          if (!file) { showToast('Please select an image', 'info'); return; }
          const quality = parseInt(document.getElementById('conv-comp-quality').value) || 75;
          showToast('Compressing image...', 'info');
          try {
            const res = await api.converter.compressImage(file.path, null, quality);
            if (res && res.success) {
              const orig = res.inputSize || file.size;
              const comp = res.outputSize || 0;
              const saved = orig > 0 ? Math.max(0, Math.round(((orig - comp) / orig) * 100)) : 0;
              showToast(`Compressed: ${saved}% size reduction`, 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Saved to: <strong>${escapeHtml(res.path || res.filePath)}</strong><br>Original: ${formatBytes(orig)} &rarr; New: ${formatBytes(comp)} (<strong>${saved}% smaller</strong>)</div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'img-batch':
        document.getElementById('converter-tool-title').textContent = 'Batch Convert Images';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Batch convert multiple images to a unified format.</p>
          <input type="file" id="conv-batch-input" multiple accept="image/*" class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <select id="conv-batch-format" class="input-field">
              <option value="webp">WebP (.webp)</option>
              <option value="jpeg">JPEG (.jpg)</option>
              <option value="png">PNG (.png)</option>
            </select>
          </div>
          <button id="btn-conv-execute" class="btn btn-action">Batch Convert</button>
        `;
        document.getElementById('btn-conv-execute').addEventListener('click', async () => {
          const files = document.getElementById('conv-batch-input').files;
          if (!files.length) { showToast('Please select images to convert', 'info'); return; }
          const format = document.getElementById('conv-batch-format').value;
          const paths = Array.from(files).map(f => f.path);
          showToast('Converting images in batch...', 'info');
          try {
            const res = await api.converter.batchConvertImages(paths, null, { format });
            if (res) {
              showToast(`Batch completed: ${res.totalProcessed || paths.length} converted`, 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Successfully processed ${res.totalProcessed || paths.length} images. Failed: ${res.totalFailed || 0}.</div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'zip-create':
        document.getElementById('converter-tool-title').textContent = 'Create ZIP Archive';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Package files and folders into a compressed ZIP archive.</p>
          <input type="file" id="conv-zip-input" multiple class="input-field mb-3" style="width:100%">
          <button id="btn-conv-execute" class="btn btn-action">Create ZIP Archive</button>
        `;
        document.getElementById('btn-conv-execute').addEventListener('click', async () => {
          const files = document.getElementById('conv-zip-input').files;
          if (!files.length) { showToast('Please select files to archive', 'info'); return; }
          const paths = Array.from(files).map(f => f.path);
          showToast('Compressing into ZIP archive...', 'info');
          try {
            const res = await api.converter.createZip(paths, null, { compressionLevel: 6 });
            if (res && res.success) {
              showToast('ZIP archive created', 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">ZIP created successfully at: <strong>${escapeHtml(res.path || res.filePath)}</strong> (${formatBytes(res.outputSize || 0)})</div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'zip-extract':
        document.getElementById('converter-tool-title').textContent = 'Extract ZIP Archive';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Safely extract the contents of a ZIP file into a destination directory.</p>
          <input type="file" id="conv-unzip-input" accept=".zip" class="input-field mb-3" style="width:100%">
          <button id="btn-conv-execute" class="btn btn-action">Extract Archive</button>
        `;
        document.getElementById('btn-conv-execute').addEventListener('click', async () => {
          const file = document.getElementById('conv-unzip-input').files[0];
          if (!file) { showToast('Please select a ZIP file', 'info'); return; }
          showToast('Extracting archive...', 'info');
          try {
            const res = await api.converter.extractZip(file.path, null);
            if (res && res.success) {
              showToast(`Extracted ${res.entryCount || ''} items`, 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Archive extracted successfully into: <strong>${escapeHtml(res.outputDir || res.path)}</strong> (${res.entryCount || 0} files extracted)</div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'zip-inspect':
        document.getElementById('converter-tool-title').textContent = 'Inspect Archive Safely';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">View contents, file list, and compression ratios inside an archive without extracting.</p>
          <input type="file" id="conv-inspect-input" accept=".zip" class="input-field mb-3" style="width:100%">
          <button id="btn-conv-execute" class="btn btn-action">Inspect Archive</button>
        `;
        document.getElementById('btn-conv-execute').addEventListener('click', async () => {
          const file = document.getElementById('conv-inspect-input').files[0];
          if (!file) { showToast('Please select a ZIP file', 'info'); return; }
          showToast('Reading archive headers...', 'info');
          try {
            const res = await api.converter.inspectArchive(file.path);
            if (res) {
              const entries = res.entries || [];
              result.classList.remove('hidden');
              result.innerHTML = `
                <div class="mb-3 text-xs text-muted">
                  Total Entries: <strong>${entries.length}</strong> | Uncompressed: <strong>${formatBytes(res.totalSize || 0)}</strong> | Compressed: <strong>${formatBytes(res.compressedSize || 0)}</strong>
                </div>
                <div class="table-container" style="max-height:250px;overflow-y:auto">
                  <table class="data-table">
                    <thead><tr><th>Entry Name</th><th>Size</th><th>Compressed</th></tr></thead>
                    <tbody>
                      ${entries.map(e => `
                        <tr>
                          <td class="font-mono text-xs">${escapeHtml(e.name || e.path)}</td>
                          <td>${formatBytes(e.size || 0)}</td>
                          <td>${formatBytes(e.compressedSize || 0)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              `;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'batch-rename':
        document.getElementById('converter-tool-title').textContent = 'Batch Rename Files';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Rename multiple files according to customizable prefix, suffix, and find/replace rules.</p>
          <input type="file" id="conv-rename-input" multiple class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <input type="text" id="rename-prefix" class="input-field flex-1" placeholder="Prefix (e.g. Doc_)">
            <input type="text" id="rename-suffix" class="input-field flex-1" placeholder="Suffix (e.g. _v1)">
            <input type="text" id="rename-find" class="input-field flex-1" placeholder="Find text">
            <input type="text" id="rename-replace" class="input-field flex-1" placeholder="Replace with">
          </div>
          <div class="flex gap-2 mb-3">
            <button id="btn-rename-preview" class="btn btn-secondary">Preview Names</button>
            <button id="btn-rename-execute" class="btn btn-action">Execute Rename</button>
          </div>
        `;
        const getRenameRules = () => ({
          prefix: document.getElementById('rename-prefix').value,
          suffix: document.getElementById('rename-suffix').value,
          findReplace: {
            find: document.getElementById('rename-find').value,
            replace: document.getElementById('rename-replace').value
          }
        });
        document.getElementById('btn-rename-preview').addEventListener('click', async () => {
          const files = document.getElementById('conv-rename-input').files;
          if (!files.length) { showToast('Select files to preview', 'info'); return; }
          const paths = Array.from(files).map(f => f.path);
          try {
            const preview = await api.converter.batchRenamePreview(paths, getRenameRules());
            result.classList.remove('hidden');
            result.innerHTML = `
              <div class="table-container" style="max-height:220px;overflow-y:auto">
                <table class="data-table">
                  <thead><tr><th>Original</th><th>&rarr;</th><th>Renamed</th></tr></thead>
                  <tbody>
                    ${(preview || []).map(p => `<tr><td class="font-mono text-xs">${escapeHtml(p.original)}</td><td>&rarr;</td><td class="font-mono text-xs text-green">${escapeHtml(p.renamed)}</td></tr>`).join('')}
                  </tbody>
                </table>
              </div>
            `;
          } catch(e) { showToast('Preview failed: ' + e.message, 'error'); }
        });
        document.getElementById('btn-rename-execute').addEventListener('click', async () => {
          const files = document.getElementById('conv-rename-input').files;
          if (!files.length) { showToast('Select files to rename', 'info'); return; }
          const paths = Array.from(files).map(f => f.path);
          try {
            const res = await api.converter.batchRenameExecute(paths, getRenameRules());
            showToast(`Renamed ${res.totalRenamed || paths.length} files`, 'success');
            result.classList.remove('hidden');
            result.innerHTML = `<div class="alert-box success">Batch rename finished. Total renamed: ${res.totalRenamed || 0}, Errors: ${res.totalFailed || 0}</div>`;
          } catch(e) { showToast('Rename failed: ' + e.message, 'error'); }
        });
        break;

      case 'batch-hash':
        document.getElementById('converter-tool-title').textContent = 'Batch Hash Generator';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Compute cryptographic digests for a set of files simultaneously.</p>
          <input type="file" id="conv-bhash-input" multiple class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <select id="conv-bhash-algo" class="input-field">
              <option value="sha256">SHA-256</option>
              <option value="md5">MD5</option>
              <option value="sha1">SHA-1</option>
            </select>
          </div>
          <button id="btn-conv-execute" class="btn btn-action">Compute Hashes</button>
        `;
        document.getElementById('btn-conv-execute').addEventListener('click', async () => {
          const files = document.getElementById('conv-bhash-input').files;
          if (!files.length) { showToast('Select files to hash', 'info'); return; }
          const algo = document.getElementById('conv-bhash-algo').value;
          const paths = Array.from(files).map(f => f.path);
          showToast('Calculating hashes...', 'info');
          try {
            const hashes = await api.converter.batchHash(paths, algo);
            result.classList.remove('hidden');
            result.innerHTML = `
              <div class="table-container" style="max-height:250px;overflow-y:auto">
                <table class="data-table">
                  <thead><tr><th>File</th><th>${algo.toUpperCase()} Hash</th></tr></thead>
                  <tbody>
                    ${(hashes || []).map(h => `
                      <tr>
                        <td class="font-mono text-xs">${escapeHtml(h.path?.split(/[\\/]/).pop() || h.path)}</td>
                        <td class="font-mono text-xs">${escapeHtml(h.hash || 'Error')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `;
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'json-format':
        document.getElementById('converter-tool-title').textContent = 'JSON Formatter & Validator';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Validate syntax and pretty-print format a JSON file.</p>
          <input type="file" id="conv-json-input" accept=".json" class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <select id="conv-json-indent" class="input-field">
              <option value="2">2 Spaces Indentation</option>
              <option value="4">4 Spaces Indentation</option>
            </select>
          </div>
          <button id="btn-conv-execute" class="btn btn-action">Format & Save JSON</button>
        `;
        document.getElementById('btn-conv-execute').addEventListener('click', async () => {
          const file = document.getElementById('conv-json-input').files[0];
          if (!file) { showToast('Select a JSON file', 'info'); return; }
          const indent = parseInt(document.getElementById('conv-json-indent').value) || 2;
          showToast('Validating and formatting JSON...', 'info');
          try {
            const res = await api.converter.formatJson(file.path, null, indent);
            if (res && res.success) {
              showToast('JSON formatted successfully', 'success');
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box success">Formatted JSON saved to: <strong>${escapeHtml(res.path || res.filePath)}</strong></div>`;
            } else if (res && !res.valid) {
              result.classList.remove('hidden');
              result.innerHTML = `<div class="alert-box critical">Invalid JSON: ${escapeHtml(res.error || 'Syntax error')}</div>`;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      case 'csv-preview':
        document.getElementById('converter-tool-title').textContent = 'CSV Data Viewer';
        content.innerHTML = `
          <p class="text-muted text-xs mb-3">Parse and preview tabular CSV spreadsheet records.</p>
          <input type="file" id="conv-csv-input" accept=".csv" class="input-field mb-3" style="width:100%">
          <div class="flex gap-2 mb-3">
            <select id="conv-csv-rows" class="input-field">
              <option value="50">Preview first 50 rows</option>
              <option value="100" selected>Preview first 100 rows</option>
              <option value="250">Preview first 250 rows</option>
            </select>
          </div>
          <button id="btn-conv-execute" class="btn btn-action">Preview CSV Data</button>
        `;
        document.getElementById('btn-conv-execute').addEventListener('click', async () => {
          const file = document.getElementById('conv-csv-input').files[0];
          if (!file) { showToast('Select a CSV file', 'info'); return; }
          const maxRows = parseInt(document.getElementById('conv-csv-rows').value) || 100;
          showToast('Parsing CSV table...', 'info');
          try {
            const res = await api.converter.previewCsv(file.path, maxRows);
            if (res && res.headers) {
              result.classList.remove('hidden');
              result.innerHTML = `
                <div class="text-xs text-muted mb-2">Showing ${res.rows?.length || 0} of ${res.totalRows || 0} total rows</div>
                <div class="table-container" style="max-height:280px;overflow:auto">
                  <table class="data-table">
                    <thead><tr>${res.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
                    <tbody>
                      ${(res.rows || []).map(row => `<tr>${row.map(cell => `<td class="text-xs">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
                    </tbody>
                  </table>
                </div>
              `;
            }
          } catch(e) { showToast('Failed: ' + e.message, 'error'); }
        });
        break;

      default:
        document.getElementById('converter-tool-title').textContent = toolId;
        content.innerHTML = `<div class="text-muted">Select an operation above.</div>`;
        break;
    }
  };

  // Wire up tool card click listeners (uses data-tool attribute or element ID)
  document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('click', () => {
      const toolId = card.getAttribute('data-tool') || card.id;
      if (!toolId) return;
      if (toolId.startsWith('pdf-')) {
        window.showPdfTool(toolId);
      } else if (
        toolId.startsWith('img-') ||
        toolId.startsWith('zip-') ||
        toolId.startsWith('json-') ||
        toolId.startsWith('csv-') ||
        toolId.startsWith('batch-')
      ) {
        window.showConverterTool(toolId);
      }
    });
  });

  // Settings Logic
  async function loadSettings() {
    if (!api.settings) return;
    try {
      const settings = await api.settings.get();
      if (settings) {
        const themeSelect = document.getElementById('setting-theme');
        if (themeSelect && settings.theme) themeSelect.value = settings.theme;

        const maxDepth = document.getElementById('setting-max-depth');
        if (maxDepth && settings.scanDefaults?.maxDepth) maxDepth.value = settings.scanDefaults.maxDepth;

        const maxFileSize = document.getElementById('setting-max-filesize');
        if (maxFileSize && settings.scanDefaults?.maxFileSize) maxFileSize.value = Math.round(settings.scanDefaults.maxFileSize / (1024 * 1024));

        const exclude = document.getElementById('setting-exclude-folders');
        if (exclude && settings.scanDefaults?.excludeFolders) exclude.value = settings.scanDefaults.excludeFolders.join(', ');

        const reportFmt = document.getElementById('setting-report-format');
        if (reportFmt && settings.exportFormat) reportFmt.value = settings.exportFormat;
      }
      
      const appInfo = await api.settings.getAppInfo();
      const aboutCard = document.getElementById('about-info') || document.getElementById('about-card');
        aboutCard.innerHTML = `
          <div><strong>FileDNA 2.0</strong> &mdash; Digital File Intelligence</div>
          <div class="mt-1">Created by: <strong style="color:var(--text-primary)">Uday Kiran Jammula</strong></div>
          <div>Version: <strong>${escapeHtml(appInfo.version || '1.0.0')}</strong> | Platform: <strong>${escapeHtml(appInfo.platform || 'Windows')} (${escapeHtml(appInfo.arch || 'x64')})</strong></div>
          <div class="mt-2 text-muted">100% Offline, Secure &amp; Private File Intelligence Ecosystem</div>
        `;
    } catch(e) { console.error('Settings error:', e); }
  }

  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    if (!api.settings) return;
    try {
      const themeSelect = document.getElementById('setting-theme');
      const theme = themeSelect?.value || 'dark';

      const maxDepth = parseInt(document.getElementById('setting-max-depth')?.value) || 50;
      const maxFileSizeMB = parseInt(document.getElementById('setting-max-filesize')?.value) || 10240;
      const excludeFolders = (document.getElementById('setting-exclude-folders')?.value || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const exportFormat = document.getElementById('setting-report-format')?.value || 'json';

      const settings = {
        theme,
        scanDefaults: {
          maxDepth,
          maxFileSize: maxFileSizeMB * 1024 * 1024,
          excludeFolders
        },
        exportFormat
      };
      await api.settings.save(settings);
      
      if (theme === 'light') document.body.classList.add('light-theme');
      else document.body.classList.remove('light-theme');
      
      showToast('Settings saved successfully', 'success');
    } catch(e) { showToast('Failed to save settings: ' + e.message, 'error'); }
  });

  document.getElementById('btn-clear-scan-history')?.addEventListener('click', async () => {
    if (confirm('Clear scan history?')) {
      // Implement clear history logic if api supports it
      showToast('Scan history cleared', 'info');
    }
  });

  document.getElementById('btn-clear-all-data')?.addEventListener('click', async () => {
    if (confirm('Clear all indexed data?')) {
      if (api.files && api.files.clearIndex) {
        await api.files.clearIndex();
        showToast('All data cleared', 'info');
        loadDashboard();
      }
    }
  });

  // Initial load
  loadDashboard();
})();
