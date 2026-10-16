const { EventEmitter } = require('events');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Advanced scanning engine module for FileDNA.
 * Handles configurable scanning, safe traversal, progress tracking, and pausing/resuming.
 */
class ScanEngine extends EventEmitter {
    /**
     * @param {Object} options Configuration options
     * @param {number} [options.maxDepth=50] Maximum directory depth to traverse
     * @param {number} [options.maxFileSize=10737418240] Maximum file size in bytes (default 10GB)
     * @param {string[]} [options.excludePatterns=[]] Array of string patterns to exclude
     * @param {string[]} [options.excludeFolders=['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information']] Folders to exclude
     * @param {boolean} [options.followSymlinks=false] Whether to follow symbolic links
     * @param {string} [options.historyStoragePath=null] Path to store scan history JSON
     */
    constructor(options = {}) {
        super();
        this.options = {
            maxDepth: 50,
            maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
            excludePatterns: [], 
            excludeFolders: ['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information'],
            followSymlinks: false,
            historyStoragePath: null,
            ...options
        };
        
        this.state = 'idle'; // 'idle' | 'scanning' | 'paused' | 'cancelled' | 'complete'
        this.stats = this._createEmptyStats();
        this.history = this._loadHistory();
        this._pausePromise = null;
        this._pauseResolve = null;
        this._cancelRequested = false;
        this.visitedDirs = new Set();
        this.startTime = null;
        this._lastProgressTime = 0;
    }

    _createEmptyStats() {
        return {
            totalFilesFound: 0,
            totalFilesProcessed: 0,
            totalFilesSkipped: 0,
            totalFilesErrored: 0,
            totalBytes: 0,
            elapsedMs: 0,
            estimatedRemainingMs: 0
        };
    }

    _loadHistory() {
        if (!this.options.historyStoragePath) return [];
        try {
            if (fs.existsSync(this.options.historyStoragePath)) {
                const data = fs.readFileSync(this.options.historyStoragePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load scan history:', error);
        }
        return [];
    }

    _saveHistory() {
        if (!this.options.historyStoragePath) return;
        try {
            const dir = path.dirname(this.options.historyStoragePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.options.historyStoragePath, JSON.stringify(this.history, null, 2), 'utf8');
        } catch (error) {
            console.error('Failed to save scan history:', error);
        }
    }

    /**
     * Pause the current scan
     */
    pause() {
        if (this.state === 'scanning') {
            this.state = 'paused';
            this._pausePromise = new Promise(resolve => {
                this._pauseResolve = resolve;
            });
        }
    }

    /**
     * Resume the paused scan
     */
    resume() {
        if (this.state === 'paused') {
            this.state = 'scanning';
            if (this._pauseResolve) {
                this._pauseResolve();
                this._pausePromise = null;
                this._pauseResolve = null;
            }
        }
    }

    /**
     * Cancel the current scan
     */
    cancel() {
        if (this.state === 'scanning' || this.state === 'paused') {
            this.state = 'cancelled';
            this._cancelRequested = true;
            this.resume(); // unblock if paused
        }
    }

    async _checkPauseAndCancel() {
        if (this.state === 'paused') {
            await this._pausePromise;
        }
        if (this._cancelRequested) {
            throw new Error('Scan cancelled');
        }
    }

    _shouldExclude(name, filePath) {
        if (this.options.excludeFolders.includes(name)) {
            this.stats.totalFilesSkipped++;
            return true;
        }
        
        for (const pattern of this.options.excludePatterns) {
            if (filePath.includes(pattern)) {
                this.stats.totalFilesSkipped++;
                return true;
            }
        }
        
        return false;
    }

    /**
     * Recursively find all files matching criteria
     * @param {string[]} paths Array of paths to scan
     * @returns {Promise<Array<{path: string, size: number, isSymlink: boolean, stat: fs.Stats}>>}
     */
    async discover(paths) {
        this.visitedDirs.clear();
        const results = [];
        this.stats.totalFilesSkipped = 0; // reset for discovery
        
        for (const p of paths) {
            try {
                const absPath = path.resolve(p);
                await this._discoverRecursive(absPath, 0, results);
            } catch (err) {
                console.error(`Error discovering path ${p}:`, err);
            }
        }
        return results;
    }

    async _discoverRecursive(currentPath, depth, results) {
        if (this.state === 'scanning' || this.state === 'paused') {
            await this._checkPauseAndCancel();
        }

        if (depth > this.options.maxDepth) return;

        let stat;
        let isSymlink = false;
        try {
            stat = await fsp.lstat(currentPath);
            isSymlink = stat.isSymbolicLink();
            
            if (isSymlink && this.options.followSymlinks) {
                stat = await fsp.stat(currentPath);
            } else if (isSymlink && !this.options.followSymlinks) {
                this.stats.totalFilesSkipped++;
                return;
            }
        } catch (err) {
            this.stats.totalFilesSkipped++;
            return;
        }

        const name = path.basename(currentPath);
        if (this._shouldExclude(name, currentPath)) return;

        if (stat.isDirectory()) {
            let realPath = currentPath;
            try {
                realPath = await fsp.realpath(currentPath);
            } catch(e) {
                // Ignore realpath failure
            }
            
            if (this.visitedDirs.has(realPath)) return;
            this.visitedDirs.add(realPath);

            let entries;
            try {
                entries = await fsp.readdir(currentPath);
            } catch (err) {
                return;
            }

            for (const entry of entries) {
                const entryPath = path.join(currentPath, entry);
                await this._discoverRecursive(entryPath, depth + 1, results);
            }
        } else if (stat.isFile()) {
            if (stat.size > this.options.maxFileSize) {
                this.stats.totalFilesSkipped++;
                return;
            }
            results.push({
                path: currentPath,
                size: stat.size,
                isSymlink: isSymlink,
                stat: stat
            });
        }
    }

    _updateProgress(force = false) {
        const now = Date.now();
        if (this.startTime) {
            this.stats.elapsedMs = now - this.startTime;
        }
        
        if (this.stats.totalFilesProcessed > 0 && this.stats.elapsedMs > 0) {
            const rate = this.stats.totalFilesProcessed / this.stats.elapsedMs;
            const remaining = this.stats.totalFilesFound - this.stats.totalFilesProcessed;
            this.stats.estimatedRemainingMs = remaining > 0 ? Math.round(remaining / rate) : 0;
        }
        
        if (force || now - this._lastProgressTime > 100) {
            this.emit('progress', { ...this.stats });
            this._lastProgressTime = now;
        }
    }

    /**
     * Discover then process each file
     * @param {string[]} paths Array of root paths
     * @param {Function} processCallback Async callback receiving (filePath, stat)
     * @returns {Promise<Array>} Array of results
     */
    async scan(paths, processCallback) {
        this.state = 'scanning';
        this._cancelRequested = false;
        const previousSkipped = this.stats.totalFilesSkipped;
        this.stats = this._createEmptyStats();
        // retain skipped from previous discover if any, or reset.
        this.stats.totalFilesSkipped = previousSkipped;
        
        this.startTime = Date.now();
        this._lastProgressTime = Date.now();
        
        const scanId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
        const scanRecord = {
            id: scanId,
            startTime: new Date(this.startTime).toISOString(),
            endTime: null,
            paths: paths,
            totalFiles: 0,
            totalBytes: 0,
            totalErrors: 0,
            status: 'running'
        };

        const finalResults = [];

        try {
            // Discovery phase
            const files = await this.discover(paths);
            this.stats.totalFilesFound = files.length;
            this._updateProgress(true);
            
            // Processing phase
            for (const file of files) {
                await this._checkPauseAndCancel();
                
                try {
                    const result = await processCallback(file.path, file.stat);
                    this.stats.totalFilesProcessed++;
                    this.stats.totalBytes += file.size;
                    
                    if (result !== undefined) {
                        finalResults.push({ path: file.path, ...result });
                    }
                    this.emit('file-processed', { path: file.path, size: file.size });
                } catch (err) {
                    this.stats.totalFilesErrored++;
                    this.emit('file-error', { path: file.path, error: err.message });
                }
                
                this._updateProgress();
            }
            
            this.state = 'complete';
            scanRecord.status = 'complete';
            this._updateProgress(true);
            this.emit('scan-complete', this.getSummary());

        } catch (err) {
            if (err.message === 'Scan cancelled') {
                this.state = 'cancelled';
                scanRecord.status = 'cancelled';
                this.emit('scan-cancelled', this.getSummary());
            } else {
                scanRecord.status = 'error';
                throw err;
            }
        } finally {
            scanRecord.endTime = new Date().toISOString();
            scanRecord.totalFiles = this.stats.totalFilesProcessed;
            scanRecord.totalBytes = this.stats.totalBytes;
            scanRecord.totalErrors = this.stats.totalFilesErrored;
            
            this.history.push(scanRecord);
            this._saveHistory();
        }

        return finalResults;
    }

    /**
     * Returns list of past scans with metadata
     * @returns {Array} Scan history
     */
    getScanHistory() {
        return this.history;
    }

    /**
     * Returns final scan statistics after completion
     * @returns {Object} Scan summary
     */
    getSummary() {
        return {
            ...this.stats,
            state: this.state
        };
    }
}

module.exports = { ScanEngine };
