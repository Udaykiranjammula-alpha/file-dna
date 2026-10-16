const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');
const sharp = require('sharp');
const archiver = require('archiver');
const unzipper = require('unzipper');
const readline = require('readline');

/**
 * ConverterEngine class handles file conversion, image manipulation,
 * archive operations, text data parsing and batch file processing.
 */
class ConverterEngine extends EventEmitter {
  constructor() {
    super();
  }

  // --- Image Operations ---

  /**
   * Converts an image to the specified format with various options.
   * @param {string} inputPath - Original image path.
   * @param {string} outputPath - Destination image path.
   * @param {Object} options - Conversion options.
   * @returns {Promise<Object>} Conversion results.
   */
  async convertImage(inputPath, outputPath, options = {}) {
    try {
      const {
        format,
        quality = 80,
        width,
        height,
        fit = 'cover',
        rotate = 0,
        flip = false,
        flop = false,
        crop,
        preserveMetadata = true,
        preserveTransparency = true
      } = options;

      let pipeline = sharp(inputPath);

      // Metadata handling
      if (preserveMetadata) {
        pipeline = pipeline.withMetadata();
      } else {
        pipeline = pipeline.keepMetadata();
      }

      // Check transparency loss
      const metadata = await pipeline.metadata();
      const hasAlpha = metadata.hasAlpha;
      if (hasAlpha && format === 'jpeg' && !preserveTransparency) {
        console.warn('Warning: Converting image with transparency to JPEG will lose transparency.');
      }

      // Transformations
      if (width || height) {
        pipeline = pipeline.resize(width, height, { fit });
      }
      if (rotate) {
        pipeline = pipeline.rotate(rotate);
      }
      if (flip) {
        pipeline = pipeline.flip();
      }
      if (flop) {
        pipeline = pipeline.flop();
      }
      if (crop) {
        pipeline = pipeline.extract({
          left: crop.left,
          top: crop.top,
          width: crop.width,
          height: crop.height
        });
      }

      // Format output
      if (format) {
        if (format === 'jpeg') {
          pipeline = pipeline.jpeg({ quality });
        } else if (format === 'png') {
          pipeline = pipeline.png({ quality });
        } else if (format === 'webp') {
          pipeline = pipeline.webp({ quality });
        } else if (format === 'tiff') {
          pipeline = pipeline.tiff({ quality });
        } else if (format === 'gif') {
          pipeline = pipeline.gif();
        } else {
          pipeline = pipeline.toFormat(format, { quality });
        }
      }

      const info = await pipeline.toFile(outputPath);
      const inputStats = await fsPromises.stat(inputPath);
      
      return {
        success: true,
        inputSize: inputStats.size,
        outputSize: info.size,
        format: info.format,
        dimensions: { width: info.width, height: info.height }
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Batch converts multiple images.
   * @param {string[]} files - Array of input file paths.
   * @param {string} outputDir - Directory to save converted images.
   * @param {Object} options - Conversion options.
   * @returns {Promise<Object>} Batch conversion results.
   */
  async batchConvertImages(files, outputDir, options = {}) {
    const results = [];
    let totalProcessed = 0;
    let totalFailed = 0;

    await fsPromises.mkdir(outputDir, { recursive: true });

    for (let i = 0; i < files.length; i++) {
      const inputPath = files[i];
      try {
        const ext = options.format ? `.${options.format}` : path.extname(inputPath);
        const fileName = path.basename(inputPath, path.extname(inputPath)) + ext;
        const outputPath = path.join(outputDir, fileName);

        const result = await this.convertImage(inputPath, outputPath, options);
        if (result.success) {
          results.push({ input: inputPath, output: outputPath, success: true });
          totalProcessed++;
        } else {
          results.push({ input: inputPath, output: outputPath, success: false, error: result.error });
          totalFailed++;
        }
      } catch (error) {
        results.push({ input: inputPath, output: null, success: false, error: error.message });
        totalFailed++;
      }
      this.emit('progress', { current: i + 1, total: files.length, type: 'batchConvert' });
    }

    return { results, totalProcessed, totalFailed };
  }

  async resizeImage(inputPath, outputPath, width, height, options = {}) {
    return this.convertImage(inputPath, outputPath, { width, height, fit: options.fit });
  }

  async compressImage(inputPath, outputPath, quality = 80) {
    return this.convertImage(inputPath, outputPath, { quality });
  }

  async rotateImage(inputPath, outputPath, degrees) {
    return this.convertImage(inputPath, outputPath, { rotate: degrees });
  }

  async cropImage(inputPath, outputPath, bounds) {
    return this.convertImage(inputPath, outputPath, { crop: bounds });
  }

  async generateThumbnail(inputPath, outputPath, size = 256) {
    return this.convertImage(inputPath, outputPath, { width: size, height: size, fit: 'cover' });
  }

  async getImageInfo(inputPath) {
    try {
      const metadata = await sharp(inputPath).metadata();
      const stats = await fsPromises.stat(inputPath);
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        space: metadata.space,
        hasAlpha: metadata.hasAlpha,
        size: stats.size,
        density: metadata.density
      };
    } catch (error) {
      throw new Error(`Failed to get image info: ${error.message}`);
    }
  }

  // --- Archive Operations ---

  async createZipArchive(inputPaths, outputPath, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { compressionLevel = 6 } = options;
        const output = fs.createWriteStream(outputPath);
        const archiveOpts = { zlib: { level: compressionLevel } };
        const archive = typeof archiver === 'function' ? archiver('zip', archiveOpts) : (archiver.ZipArchive ? new archiver.ZipArchive(archiveOpts) : new archiver.Archiver('zip', archiveOpts));

        output.on('close', async () => {
          resolve({
            success: true,
            outputSize: archive.pointer(),
            entryCount: inputPaths.length
          });
        });

        archive.on('error', (err) => {
          reject(err);
        });

        archive.pipe(output);

        for (const inputPath of inputPaths) {
          const stats = await fsPromises.stat(inputPath);
          if (stats.isDirectory()) {
            archive.directory(inputPath, path.basename(inputPath));
          } else {
            archive.file(inputPath, { name: path.basename(inputPath) });
          }
        }

        await archive.finalize();
      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    });
  }

  async extractZipArchive(archivePath, outputDir, options = {}) {
    return new Promise(async (resolve) => {
      try {
        const { overwrite = false, selectedEntries = null } = options;
        let entryCount = 0;
        let totalSize = 0;
        const warnings = [];

        await fsPromises.mkdir(outputDir, { recursive: true });

        fs.createReadStream(archivePath)
          .pipe(unzipper.Parse())
          .on('entry', async (entry) => {
            const fileName = entry.path;
            const type = entry.type;
            const size = entry.vars.uncompressedSize;
            const compressedSize = entry.vars.compressedSize;

            // Security: Path traversal protection
            if (fileName.includes('..') || fileName.startsWith('/') || fileName.startsWith('\\')) {
              warnings.push(`Skipped potential path traversal entry: ${fileName}`);
              entry.autodrain();
              return;
            }

            // Security: Zip bomb protection
            if (compressedSize > 0 && size / compressedSize > 100) {
              warnings.push(`Skipped highly compressed entry (potential zip bomb): ${fileName}`);
              entry.autodrain();
              return;
            }

            if (selectedEntries && !selectedEntries.includes(fileName)) {
              entry.autodrain();
              return;
            }

            const targetPath = path.join(outputDir, fileName);

            if (type === 'Directory') {
              await fsPromises.mkdir(targetPath, { recursive: true });
              entry.autodrain();
            } else {
              try {
                if (!overwrite) {
                  try {
                    await fsPromises.access(targetPath);
                    warnings.push(`File already exists, skipping: ${fileName}`);
                    entry.autodrain();
                    return;
                  } catch (e) {
                    // File does not exist, safe to extract
                  }
                }
                
                await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
                entry.pipe(fs.createWriteStream(targetPath));
                entryCount++;
                totalSize += size;
              } catch (err) {
                warnings.push(`Failed to extract ${fileName}: ${err.message}`);
                entry.autodrain();
              }
            }
          })
          .on('close', () => {
            resolve({ success: true, entryCount, totalSize, warnings });
          })
          .on('error', (err) => {
            resolve({ success: false, error: err.message, warnings });
          });
      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    });
  }

  async inspectArchive(archivePath) {
    return new Promise((resolve) => {
      const entries = [];
      let totalSize = 0;
      let compressedSize = 0;

      try {
        fs.createReadStream(archivePath)
          .pipe(unzipper.Parse())
          .on('entry', (entry) => {
            entries.push({
              name: entry.path,
              size: entry.vars.uncompressedSize,
              compressedSize: entry.vars.compressedSize,
              isDirectory: entry.type === 'Directory',
              modified: entry.vars.lastModifiedTime
            });
            totalSize += entry.vars.uncompressedSize;
            compressedSize += entry.vars.compressedSize;
            entry.autodrain();
          })
          .on('close', () => {
            resolve({
              format: 'zip',
              entries,
              totalSize,
              compressedSize,
              entryCount: entries.length,
              compressionRatio: totalSize > 0 ? compressedSize / totalSize : 0
            });
          })
          .on('error', (err) => {
            resolve({ error: err.message });
          });
      } catch (error) {
        resolve({ error: error.message });
      }
    });
  }

  // --- Text/Data Operations ---

  async formatJson(inputPath, outputPath, indent = 2) {
    try {
      const content = await fsPromises.readFile(inputPath, 'utf8');
      const inputSize = Buffer.byteLength(content, 'utf8');
      
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, indent);
      
      await fsPromises.writeFile(outputPath, formatted, 'utf8');
      const outputSize = Buffer.byteLength(formatted, 'utf8');

      return { success: true, valid: true, error: null, inputSize, outputSize };
    } catch (error) {
      return { success: false, valid: false, error: error.message, inputSize: 0, outputSize: 0 };
    }
  }

  async validateJson(inputPath) {
    try {
      const content = await fsPromises.readFile(inputPath, 'utf8');
      const parsed = JSON.parse(content);
      const keys = Object.keys(parsed);
      
      // Calculate depth
      const getDepth = (obj) => {
        let maxDepth = 0;
        if (typeof obj === 'object' && obj !== null) {
          for (let key in obj) {
            maxDepth = Math.max(maxDepth, getDepth(obj[key]));
          }
          return maxDepth + 1;
        }
        return 0;
      };

      return { valid: true, error: null, keys, depth: getDepth(parsed) };
    } catch (error) {
      return { valid: false, error: error.message, keys: [], depth: 0 };
    }
  }

  async formatXml(inputPath, outputPath) {
    try {
      // Basic approach: read, and simple regex indent. (Production would use an XML parser, but keeping it simple)
      const content = await fsPromises.readFile(inputPath, 'utf8');
      
      // Very naive XML formatting
      let formatted = '';
      let pad = 0;
      content.split(/>\s*</).forEach((node) => {
        if (node.match(/^\/\w/)) pad -= 1;
        formatted += '  '.repeat(pad > 0 ? pad : 0) + '<' + node + '>\r\n';
        if (node.match(/^<?\w[^>]*[^\/]$/)) pad += 1;
      });
      formatted = formatted.replace(/(<.+>)\s*(<\/.+>)/g, '$1$2').trim(); // clean up
      
      await fsPromises.writeFile(outputPath, formatted, 'utf8');
      return { success: true, valid: true, error: null };
    } catch (error) {
      return { success: false, valid: false, error: error.message };
    }
  }

  async detectEncoding(inputPath) {
    try {
      const fd = await fsPromises.open(inputPath, 'r');
      const buffer = Buffer.alloc(4);
      await fd.read(buffer, 0, 4, 0);
      await fd.close();

      let encoding = 'unknown';
      let hasBOM = false;

      if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        encoding = 'utf-8';
        hasBOM = true;
      } else if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        encoding = 'utf-16le';
        hasBOM = true;
      } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        encoding = 'utf-16be';
        hasBOM = true;
      } else {
        // Fallback or basic heuristic
        encoding = 'utf-8'; 
      }
      
      return { encoding, hasBOM };
    } catch (error) {
      return { encoding: 'unknown', hasBOM: false, error: error.message };
    }
  }

  async convertToUtf8(inputPath, outputPath) {
    try {
      const { encoding, hasBOM } = await this.detectEncoding(inputPath);
      let content;

      if (encoding === 'utf-16le') {
        content = await fsPromises.readFile(inputPath, 'utf16le');
      } else {
        content = await fsPromises.readFile(inputPath, 'utf8');
      }
      
      await fsPromises.writeFile(outputPath, content, 'utf8');
      const stats = await fsPromises.stat(outputPath);

      return { success: true, originalEncoding: encoding, outputSize: stats.size };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async previewCsv(inputPath, maxRows = 100) {
    return new Promise((resolve) => {
      const headers = [];
      const rows = [];
      let totalRows = 0;
      let truncated = false;

      const rl = readline.createInterface({
        input: fs.createReadStream(inputPath),
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        if (totalRows === 0) {
          headers.push(...line.split(','));
        } else if (totalRows <= maxRows) {
          rows.push(line.split(','));
        } else {
          truncated = true;
          rl.close();
        }
        totalRows++;
      });

      rl.on('close', () => {
        resolve({ headers, rows, totalRows, truncated });
      });
      
      rl.on('error', (error) => {
        resolve({ error: error.message });
      });
    });
  }

  // --- Batch Rename ---

  async previewBatchRename(files, rules) {
    const { prefix = '', suffix = '', findReplace, sequentialNumber, cleanup, extensionFilter } = rules;
    const preview = [];
    const usedNames = new Set();
    
    let counter = sequentialNumber ? sequentialNumber.start || 1 : 1;

    for (const file of files) {
      const dir = path.dirname(file);
      const ext = path.extname(file);
      let name = path.basename(file, ext);

      if (extensionFilter && ext !== extensionFilter) {
        preview.push({ original: file, renamed: file, conflict: false });
        continue;
      }

      if (findReplace && findReplace.find) {
        name = name.split(findReplace.find).join(findReplace.replace || '');
      }

      if (cleanup) {
        name = name.replace(/[^a-zA-Z0-9_\-]/g, '_');
      }

      let newName = `${prefix}${name}${suffix}`;
      if (sequentialNumber) {
        const padding = sequentialNumber.padding || 3;
        newName += String(counter).padStart(padding, '0');
        counter++;
      }
      
      const renamed = path.join(dir, newName + ext);
      const conflict = usedNames.has(renamed);
      usedNames.add(renamed);

      preview.push({ original: file, renamed, conflict });
    }

    return preview;
  }

  async executeBatchRename(files, rules) {
    const preview = await this.previewBatchRename(files, rules);
    const results = [];
    let totalRenamed = 0;
    let totalFailed = 0;

    for (const item of preview) {
      if (item.conflict) {
        results.push({ original: item.original, renamed: item.renamed, success: false, error: 'Name conflict' });
        totalFailed++;
        continue;
      }

      if (item.original === item.renamed) {
        results.push({ original: item.original, renamed: item.renamed, success: true, skipped: true });
        continue;
      }

      try {
        await fsPromises.rename(item.original, item.renamed);
        results.push({ original: item.original, renamed: item.renamed, success: true });
        totalRenamed++;
      } catch (error) {
        results.push({ original: item.original, renamed: item.renamed, success: false, error: error.message });
        totalFailed++;
      }
    }

    return { results, totalRenamed, totalFailed };
  }

  // --- Batch Hashing ---

  async batchHash(files, algorithm = 'sha256') {
    const results = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const stats = await fsPromises.stat(file);
        const hash = await new Promise((resolve, reject) => {
          const hashStream = crypto.createHash(algorithm);
          const rs = fs.createReadStream(file);
          rs.on('error', reject);
          rs.pipe(hashStream).on('finish', () => {
            resolve(hashStream.digest('hex'));
          });
        });

        results.push({ path: file, hash, size: stats.size });
      } catch (error) {
        results.push({ path: file, error: error.message });
      }
      this.emit('progress', { current: i + 1, total: files.length, type: 'batchHash' });
    }

    return results;
  }
}

module.exports = ConverterEngine;
