const fs = require('fs');
const path = require('path');
const exifr = require('exifr');
const mm = require('music-metadata');
const pdfParse = require('pdf-parse');
const unzipper = require('unzipper');

/**
 * MetadataEngine provides universal metadata extraction for FileDNA.
 */
class MetadataEngine {
  /**
   * Universal Metadata Extraction
   * Detects file type by extension and calls appropriate extractor
   * @param {string} filePath Absolute path to the file
   * @returns {Promise<Object>} Metadata object
   */
  async extractMetadata(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const name = path.basename(filePath);
      
      const common = {
        name,
        size: stats.size,
        extension: ext,
        created: stats.birthtime,
        modified: stats.mtime
      };

      const typeMap = {
        '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image', '.tiff': 'image', '.heic': 'image',
        '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.m4a': 'audio', '.ogg': 'audio',
        '.mp4': 'video', '.mkv': 'video', '.avi': 'video', '.mov': 'video', '.webm': 'video',
        '.pdf': 'document', '.txt': 'document', '.json': 'document', '.csv': 'document', '.xml': 'document',
        '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive', '.gz': 'archive',
        '.js': 'code', '.py': 'code', '.html': 'code', '.css': 'code'
      };

      const mimeTypeMap = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf',
        '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.zip': 'application/zip'
      };
      
      common.mimeType = mimeTypeMap[ext] || 'application/octet-stream';
      const type = typeMap[ext] || 'unknown';

      let specific = {};
      let hasGpsData = false;
      const privacyWarnings = [];

      switch (type) {
        case 'image':
          specific = await this.extractImageMetadata(filePath);
          if (specific && specific.gps && specific.gps.latitude !== undefined) {
            hasGpsData = true;
            privacyWarnings.push("⚠️ This image contains GPS location data that may reveal where the photo was taken.");
          }
          break;
        case 'audio':
          specific = await this.extractAudioMetadata(filePath);
          break;
        case 'video':
          specific = await this.extractVideoMetadata(filePath);
          break;
        case 'document':
          specific = await this.extractDocumentMetadata(filePath, ext);
          break;
        case 'archive':
          specific = await this.extractArchiveMetadata(filePath, ext);
          if (specific && specific.format === 'zip' && specific.expansionRatio > 100) {
            privacyWarnings.push("⚠️ Potential zip bomb detected: extremely high compression ratio.");
          }
          break;
      }

      const privacyResult = await this.checkPrivacy(filePath, type, specific);
      if (privacyResult.sensitivitFields && privacyResult.sensitivitFields.length > 0) {
        privacyWarnings.push(...privacyResult.sensitivitFields.map(f => `Sensitive field detected: ${f.field} (Risk: ${f.risk})`));
      }

      return {
        type,
        common,
        specific: specific || {},
        hasGpsData,
        privacyWarnings
      };
    } catch (error) {
      console.error(`Error extracting metadata for ${filePath}:`, error);
      return { type: 'unknown', common: {}, specific: {}, hasGpsData: false, privacyWarnings: [`Error: ${error.message}`] };
    }
  }

  /**
   * Extract image metadata using exifr
   * @param {string} filePath
   * @returns {Promise<Object>}
   */
  async extractImageMetadata(filePath) {
    try {
      const exif = await exifr.parse(filePath, { tiff: true, exif: true, gps: true });
      if (!exif) return {};

      return {
        dimensions: { width: exif.ExifImageWidth || exif.ImageWidth, height: exif.ExifImageHeight || exif.ImageHeight },
        orientation: exif.Orientation,
        colorSpace: exif.ColorSpace,
        bitDepth: exif.BitsPerSample ? (Array.isArray(exif.BitsPerSample) ? exif.BitsPerSample[0] : exif.BitsPerSample) : null,
        camera: {
          make: exif.Make,
          model: exif.Model,
          lens: exif.LensModel,
          focalLength: exif.FocalLength,
          aperture: exif.FNumber,
          shutterSpeed: exif.ExposureTime,
          iso: exif.ISO
        },
        gps: exif.latitude ? { latitude: exif.latitude, longitude: exif.longitude, altitude: exif.GPSAltitude } : null,
        dateTime: { original: exif.DateTimeOriginal, digitized: exif.CreateDate },
        software: exif.Software,
        copyright: exif.Copyright,
        description: exif.ImageDescription
      };
    } catch (error) {
      console.error('Image metadata error:', error);
      return null;
    }
  }

  /**
   * Extract audio metadata using music-metadata
   * @param {string} filePath
   * @returns {Promise<Object>}
   */
  async extractAudioMetadata(filePath) {
    try {
      const metadata = await mm.parseFile(filePath, { duration: true });
      return {
        title: metadata.common.title,
        artist: metadata.common.artist,
        album: metadata.common.album,
        year: metadata.common.year,
        track: metadata.common.track?.no,
        genre: metadata.common.genre ? metadata.common.genre.join(', ') : null,
        duration: metadata.format.duration,
        bitrate: metadata.format.bitrate,
        sampleRate: metadata.format.sampleRate,
        channels: metadata.format.numberOfChannels,
        codec: metadata.format.codec,
        lossless: metadata.format.lossless,
        albumArt: !!(metadata.common.picture && metadata.common.picture.length > 0)
      };
    } catch (error) {
      console.error('Audio metadata error:', error);
      return null;
    }
  }

  /**
   * Extract video metadata
   * @param {string} filePath
   * @returns {Promise<Object>}
   */
  async extractVideoMetadata(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      // Basic metadata from file headers where possible
      // Full video metadata requires ffprobe which we don't have
      return {
        container: ext.replace('.', ''),
        size: stats.size,
        duration: null, // detectable duration is limited without ffprobe
        limitations: "Full video metadata requires ffprobe/ffmpeg."
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract document metadata
   * @param {string} filePath
   * @param {string} ext
   * @returns {Promise<Object>}
   */
  async extractDocumentMetadata(filePath, ext) {
    try {
      if (ext === '.pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return {
          title: data.info?.Title || null,
          author: data.info?.Author || null,
          subject: data.info?.Subject || null,
          creator: data.info?.Creator || null,
          producer: data.info?.Producer || null,
          pageCount: data.numpages || 0,
          creationDate: data.info?.CreationDate || null,
          hasText: !!data.text
        };
      } else if (ext === '.txt') {
        const content = fs.readFileSync(filePath, 'utf8');
        return {
          encoding: 'utf8', // Assumption for now
          lineCount: content.split('\n').length,
          wordCount: content.split(/\s+/).filter(w => w.length > 0).length,
          charCount: content.length,
          language: 'unknown' // Requires nlp logic or external lib
        };
      } else if (ext === '.json') {
        const content = fs.readFileSync(filePath, 'utf8');
        let valid = false;
        let keys = 0;
        try {
          const obj = JSON.parse(content);
          valid = true;
          keys = Object.keys(obj).length;
        } catch(e) {}
        return { valid, keys, depth: valid ? 1 : 0, size: content.length }; 
      } else if (ext === '.csv') {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        return {
          rows: lines.length,
          columns: lines[0] ? lines[0].split(',').length : 0,
          headers: lines[0] ? lines[0].split(',') : [],
          encoding: 'utf8'
        };
      } else if (ext === '.xml') {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(/<([a-zA-Z0-9_:-]+)[\s>]/);
        return {
          valid: !!match,
          rootElement: match ? match[1] : null,
          encoding: 'utf8'
        };
      }
      return null;
    } catch (error) {
      console.error('Document metadata error:', error);
      return null;
    }
  }

  /**
   * Extract archive metadata
   * @param {string} filePath
   * @param {string} ext
   * @returns {Promise<Object>}
   */
  async extractArchiveMetadata(filePath, ext) {
    try {
      if (ext === '.zip') {
        const directory = await unzipper.Open.file(filePath);
        let totalUncompressedSize = 0;
        const entries = directory.files.map(f => {
          totalUncompressedSize += f.uncompressedSize;
          return {
            name: f.path,
            size: f.uncompressedSize,
            compressedSize: f.compressedSize,
            isDirectory: f.type === 'Directory'
          };
        });
        
        const stats = await fs.promises.stat(filePath);
        const compressionRatio = stats.size > 0 ? (totalUncompressedSize / stats.size) : 0;
        
        return {
          format: 'zip',
          entryCount: entries.length,
          totalUncompressedSize,
          compressionRatio,
          expansionRatio: compressionRatio,
          entries: entries.slice(0, 100) // cap entries to prevent huge objects
        };
      }
      return { format: ext.replace('.', ''), entryCount: 0 };
    } catch (error) {
      console.error('Archive metadata error:', error);
      return null;
    }
  }

  /**
   * Check metadata for privacy issues
   * @param {string} filePath
   * @param {string} type
   * @param {Object} specific
   * @returns {Promise<Object>}
   */
  async checkPrivacy(filePath, type, specific) {
    const sensitivitFields = [];
    if (!specific) return { sensitivitFields };

    try {
      if (type === 'image') {
        if (specific.gps && specific.gps.latitude !== undefined) {
          sensitivitFields.push({ field: 'gps', value: 'Coordinates found', risk: 'high', description: 'GPS coordinates reveal location.' });
        }
        if (specific.camera && (specific.camera.make || specific.camera.model)) {
          sensitivitFields.push({ field: 'camera', value: `${specific.camera.make || ''} ${specific.camera.model || ''}`.trim(), risk: 'low', description: 'Camera model information.' });
        }
        if (specific.software) {
          sensitivitFields.push({ field: 'software', value: specific.software, risk: 'low', description: 'Software used to edit or create.' });
        }
      } else if (type === 'document' && specific) {
        if (specific.author) {
          sensitivitFields.push({ field: 'author', value: specific.author, risk: 'medium', description: 'Document author name.' });
        }
        if (specific.creator) {
          sensitivitFields.push({ field: 'creator', value: specific.creator, risk: 'low', description: 'Document creator software.' });
        }
      } else if (type === 'audio' && specific) {
        if (specific.artist) {
            sensitivitFields.push({ field: 'artist', value: specific.artist, risk: 'low', description: 'Artist name' });
        }
      }
      return { sensitivitFields };
    } catch (error) {
      console.error('Privacy check error:', error);
      return { sensitivitFields: [] };
    }
  }
}

module.exports = new MetadataEngine();
