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
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>${message}</span>
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
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  document.getElementById('btn-view-all-registry')?.addEventListener('click', () => switchTab('registry'));

  // 1. Dashboard Logic
  async function loadDashboard() {
    try {
      const data = await api.system.getDashboardData();
      if (!data) return;

      document.getElementById('stat-files-count').textContent = data.totalFiles.toLocaleString();
      document.getElementById('stat-storage-size').textContent = `${data.totalStorageMB} MB`;
      document.getElementById('stat-storage-gb').textContent = `${data.totalStorageGB} GB analyzed`;
      document.getElementById('stat-duplicate-count').textContent = data.duplicateCount.toLocaleString();
      document.getElementById('stat-wasted-storage').textContent = `${data.wastedMB} MB recoverable`;
      document.getElementById('stat-avg-entropy').textContent = data.avgEntropy;
      document.getElementById('dup-badge').textContent = data.duplicateCount;

      // Category breakdown bars
      renderCategoryBars(data.categoryCounts, data.categoryStorage, data.totalStorage);

      // Recent Files
      renderRecentFiles(data.recentFiles || []);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    }
  }

  function renderCategoryBars(counts = {}, storage = {}, totalStorage = 1) {
    const container = document.getElementById('category-bars');
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
            <span><strong>${cat}</strong> (${count} files)</span>
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
    if (!files.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-6">No recent files found. Drop files above to begin.</td></tr>`;
      return;
    }

    tbody.innerHTML = files.map(f => `
      <tr>
        <td><strong>${escapeHtml(f.name)}</strong></td>
        <td><span class="badge badge-category">${f.category}</span></td>
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

  // 2. DNA Inspector Logic
  window.inspectFile = async function(filePath) {
    try {
      const dna = await api.files.getDNA(filePath);
      if (!dna) {
        showToast('File details unavailable', 'info');
        return;
      }

      currentInspectedFile = dna;
      switchTab('inspector');

      document.getElementById('inspector-placeholder').classList.add('hidden');
      const card = document.getElementById('inspector-card');
      card.classList.remove('hidden');

      // Hero info
      document.getElementById('dna-filename').textContent = dna.identity.name;
      document.getElementById('dna-filepath').textContent = dna.identity.path;
      document.getElementById('dna-category-badge').textContent = dna.identity.category;

      const uniquenessBox = document.getElementById('dna-uniqueness-badge');
      if (dna.duplicates.isUnique) {
        uniquenessBox.innerHTML = `<span class="status-pill status-unique">UNIQUE CONTENT</span>`;
      } else {
        uniquenessBox.innerHTML = `<span class="status-pill status-duplicate">${dna.duplicates.matchCount} IDENTICAL COPIES</span>`;
      }

      // Hashes
      document.getElementById('dna-sha256').textContent = dna.forensics.sha256 || '---';
      document.getElementById('dna-md5').textContent = dna.forensics.md5 || '---';

      // Shannon Entropy Gauge
      const entropy = dna.forensics.entropy || 0;
      document.getElementById('dna-entropy-score').textContent = `${entropy.toFixed(2)} / 8.00`;
      const entropyPct = Math.min(100, Math.round((entropy / 8.0) * 100));
      document.getElementById('dna-entropy-progress').style.width = `${entropyPct}%`;
      document.getElementById('dna-entropy-class').textContent = dna.forensics.classification || 'Standard Binary';

      // Barcode Visualizer (16-bucket byte density)
      const barcodeContainer = document.getElementById('dna-barcode-container');
      const barcodeData = dna.forensics.barcode || new Array(16).fill(0);
      barcodeContainer.innerHTML = barcodeData.map(val => `
        <div class="barcode-bar" style="height: ${Math.max(8, Math.min(100, val * 2))}%;" title="Density: ${val}%"></div>
      `).join('');

      // Structure and Metadata
      document.getElementById('dna-filesize').textContent = formatBytes(dna.identity.size);
      document.getElementById('dna-filesize-bytes').textContent = `${dna.identity.size.toLocaleString()} bytes`;
      document.getElementById('dna-mimetype').textContent = dna.identity.mimeType;
      document.getElementById('dna-magic-header').textContent = `Header: ${dna.identity.magic?.headerHex || 'N/A'} (${dna.identity.magic?.signature || 'Generic'})`;

      if (dna.content && dna.content.isText) {
        document.getElementById('dna-structure').textContent = `${dna.content.lines} lines, ${dna.content.words} words`;
        document.getElementById('dna-structure-sub').textContent = `${dna.content.chars} characters (${dna.content.blankLines} blank lines)`;
      } else {
        document.getElementById('dna-structure').textContent = 'Binary Executable / Media';
        document.getElementById('dna-structure-sub').textContent = 'Non-plaintext structural layout';
      }

      // Duplicate list if any
      const dupPanel = document.getElementById('dna-duplicates-panel');
      const dupList = document.getElementById('dna-duplicates-list');
      if (!dna.duplicates.isUnique && dna.duplicates.copies.length > 1) {
        dupPanel.classList.remove('hidden');
        document.getElementById('dna-duplicates-count').textContent = `${dna.duplicates.copies.length} copies`;
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

    } catch (err) {
      console.error('Inspector error:', err);
    }
  };

  // 3. Duplicate Vault Logic
  async function loadDuplicates() {
    try {
      const result = await api.files.getDuplicateDetection();
      const container = document.getElementById('duplicate-groups-container');
      const badge = document.getElementById('dup-badge');
      const wastedSize = document.getElementById('vault-wasted-size');

      badge.textContent = result.totalDuplicateCount;
      wastedSize.textContent = `${result.totalWastedMB} MB`;

      if (!result.duplicates.length) {
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
      const results = await api.files.search(query, activeCategory);
      const tbody = document.getElementById('registry-tbody');

      if (!results.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-8">No files match current criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = results.map(f => `
        <tr>
          <td><strong>${escapeHtml(f.name)}</strong></td>
          <td><span class="badge badge-category">${f.category}</span></td>
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
      loadRegistry(globalSearch.value);
    });
  });

  // Global search input
  globalSearch.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (activeTab !== 'registry') switchTab('registry');
      loadRegistry(e.target.value);
    }, 200);
  });

  // Window helper actions
  window.revealFile = async function(filePath) {
    await api.files.revealInExplorer(filePath);
  };

  window.deleteDuplicate = async function(filePath) {
    if (confirm(`Move duplicate to Windows Recycle Bin?\n\n${filePath}`)) {
      const res = await api.files.deleteFile(filePath);
      if (res.success) {
        showToast('Moved duplicate to Recycle Bin', 'success');
        loadDuplicates();
        loadDashboard();
      } else {
        showToast(res.error || 'Failed to delete file', 'info');
      }
    }
  };

  // Copy Buttons in Inspector
  document.getElementById('btn-copy-sha256')?.addEventListener('click', () => {
    copyText(document.getElementById('dna-sha256').textContent, 'SHA-256');
  });

  document.getElementById('btn-copy-md5')?.addEventListener('click', () => {
    copyText(document.getElementById('dna-md5').textContent, 'MD5');
  });

  document.getElementById('btn-copy-path')?.addEventListener('click', () => {
    copyText(document.getElementById('dna-filepath').textContent, 'File path');
  });

  document.getElementById('btn-reveal-explorer')?.addEventListener('click', () => {
    if (currentInspectedFile) window.revealFile(currentInspectedFile.identity.path);
  });

  // Import Action Handlers
  async function triggerImportFiles() {
    showToast('Scanning files...', 'info');
    const res = await api.files.import();
    if (res.success && res.count > 0) {
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
      await api.files.clearIndex();
      showToast('Cache cleared', 'info');
      loadDashboard();
    }
  });

  // Export Report Handler
  document.getElementById('btn-export-report')?.addEventListener('click', async () => {
    const res = await api.files.exportReport('json');
    if (res && res.success) {
      showToast(`Exported report: ${res.filePath}`, 'success');
    }
  });

  // Global Drag & Drop Handler
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

    if (paths.length > 0) {
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

  // HTML escape helpers
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeJsStr(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  // Initial load
  loadDashboard();
})();
