const fs = require('fs').promises;
const { PDFDocument, StandardFonts, rgb, degrees, PageSizes } = require('pdf-lib');
const pdfParse = require('pdf-parse');

/**
 * A comprehensive toolkit for PDF creation, manipulation, and analysis.
 */
class PdfEngine {
    /**
     * Create a PDF document from text.
     * @param {string} text - The text content.
     * @param {object} options - Configuration options.
     * @returns {Promise<{buffer: Uint8Array, pageCount: number}>}
     */
    async createPdfFromText(text, options = {}) {
        try {
            const doc = await PDFDocument.create();
            const font = await doc.embedFont(StandardFonts.Helvetica);
            
            const fontSize = options.fontSize || 12;
            const pageSizeKey = options.pageSize || 'A4';
            const pageDims = PageSizes[pageSizeKey] || PageSizes.A4;
            
            let width = pageDims[0];
            let height = pageDims[1];
            
            if (options.orientation === 'landscape') {
                width = pageDims[1];
                height = pageDims[0];
            }

            const margins = options.margins || { top: 50, bottom: 50, left: 50, right: 50 };
            
            let page = doc.addPage([width, height]);
            let { width: pWidth, height: pHeight } = page.getSize();
            let y = pHeight - margins.top;

            const lines = text.split('\n');
            
            for (const line of lines) {
                if (y < margins.bottom + fontSize) {
                    page = doc.addPage([width, height]);
                    y = pHeight - margins.top;
                }
                
                page.drawText(line, {
                    x: margins.left,
                    y: y,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                    maxWidth: pWidth - margins.left - margins.right
                });
                
                // Very basic line wrapping logic based on newlines; pdf-lib has limited built-in text wrapping.
                // For a more robust implementation, we would calculate text width and break words, but simple newline splitting is a start.
                y -= (fontSize + 4);
            }

            if (options.title) doc.setTitle(options.title);
            if (options.author) doc.setAuthor(options.author);
            
            const buffer = await doc.save({ useObjectStreams: false });
            return { buffer, pageCount: doc.getPageCount() };
        } catch (error) {
            throw new Error(`Failed to create PDF from text: ${error.message}`);
        }
    }

    /**
     * Create a PDF from an array of image paths.
     * @param {string[]} imagePaths - Paths to image files.
     * @param {object} options - Options.
     * @returns {Promise<{buffer: Uint8Array, pageCount: number}>}
     */
    async createPdfFromImages(imagePaths, options = {}) {
        try {
            const doc = await PDFDocument.create();
            const pageSizeKey = options.pageSize || 'A4';
            const pageDims = PageSizes[pageSizeKey] || PageSizes.A4;
            
            let pWidth = pageDims[0];
            let pHeight = pageDims[1];
            
            if (options.orientation === 'landscape') {
                pWidth = pageDims[1];
                pHeight = pageDims[0];
            }
            
            for (const imgPath of imagePaths) {
                const imgData = await fs.readFile(imgPath);
                let image;
                
                if (imgPath.toLowerCase().endsWith('.png')) {
                    image = await doc.embedPng(imgData);
                } else if (imgPath.toLowerCase().match(/\.(jpg|jpeg)$/)) {
                    image = await doc.embedJpg(imgData);
                } else {
                    continue; // Skip unsupported
                }

                const page = doc.addPage([pWidth, pHeight]);
                let imgDims = image.scale(1);
                
                // Simple fit logic
                const fitScale = Math.min(
                    pWidth / imgDims.width,
                    pHeight / imgDims.height
                );
                
                const finalDims = image.scale(fitScale);
                const x = (pWidth - finalDims.width) / 2;
                const y = (pHeight - finalDims.height) / 2;

                page.drawImage(image, {
                    x,
                    y,
                    width: finalDims.width,
                    height: finalDims.height
                });
            }
            
            if (options.title) doc.setTitle(options.title);

            const buffer = await doc.save();
            return { buffer, pageCount: doc.getPageCount() };
        } catch (error) {
            throw new Error(`Failed to create PDF from images: ${error.message}`);
        }
    }

    /**
     * Merge multiple PDF buffers into one.
     * @param {Uint8Array[]} pdfBuffers - Array of PDF buffers.
     * @returns {Promise<{buffer: Uint8Array, pageCount: number}>}
     */
    async mergePdfs(pdfBuffers) {
        try {
            const mergedPdf = await PDFDocument.create();
            
            for (const buf of pdfBuffers) {
                const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach(page => mergedPdf.addPage(page));
            }
            
            const buffer = await mergedPdf.save();
            return { buffer, pageCount: mergedPdf.getPageCount() };
        } catch (error) {
            throw new Error(`Failed to merge PDFs: ${error.message}`);
        }
    }

    /**
     * Split a PDF by specific ranges.
     * @param {Uint8Array} pdfBuffer - The source PDF buffer.
     * @param {Array<{start: number, end: number}>} ranges - Array of 1-indexed ranges.
     * @returns {Promise<Array<{buffer: Uint8Array, pageCount: number, range: string}>>}
     */
    async splitPdf(pdfBuffer, ranges) {
        try {
            const sourceDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const maxPages = sourceDoc.getPageCount();
            const results = [];

            if (typeof ranges === 'string') {
                const parsedRanges = [];
                const parts = ranges.split(',');
                for (const part of parts) {
                    const trimmed = part.trim();
                    if (!trimmed) continue;
                    if (trimmed.includes('-')) {
                        const [s, e] = trimmed.split('-').map(Number);
                        if (!isNaN(s) && !isNaN(e)) parsedRanges.push({ start: s, end: e });
                    } else {
                        const n = Number(trimmed);
                        if (!isNaN(n)) parsedRanges.push({ start: n, end: n });
                    }
                }
                ranges = parsedRanges;
            }

            if (!Array.isArray(ranges) || ranges.length === 0) {
                ranges = [{ start: 1, end: maxPages }];
            }
            
            for (const range of ranges) {
                const start = Math.max(1, range.start);
                const end = Math.min(maxPages, range.end);
                
                if (start > end) continue;
                
                const newDoc = await PDFDocument.create();
                const indices = [];
                for (let i = start - 1; i <= end - 1; i++) {
                    indices.push(i);
                }
                
                const copiedPages = await newDoc.copyPages(sourceDoc, indices);
                copiedPages.forEach(page => newDoc.addPage(page));
                
                results.push({
                    buffer: await newDoc.save(),
                    pageCount: newDoc.getPageCount(),
                    range: `${start}-${end}`
                });
            }
            
            return results;
        } catch (error) {
            throw new Error(`Failed to split PDF: ${error.message}`);
        }
    }

    /**
     * Extract specific pages.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @param {number[]|string} pageNumbers - Array of 1-indexed page numbers or comma-separated string.
     * @returns {Promise<{buffer: Uint8Array, pageCount: number}>}
     */
    async extractPages(pdfBuffer, pageNumbers) {
        try {
            const sourceDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const maxPages = sourceDoc.getPageCount();
            const newDoc = await PDFDocument.create();

            if (typeof pageNumbers === 'string') {
                pageNumbers = pageNumbers.split(',').flatMap(p => {
                    const trimmed = p.trim();
                    if (trimmed.includes('-')) {
                        const [s, e] = trimmed.split('-').map(Number);
                        const arr = [];
                        for (let i = s; i <= e; i++) arr.push(i);
                        return arr;
                    }
                    const n = Number(trimmed);
                    return isNaN(n) ? [] : [n];
                });
            }

            if (!Array.isArray(pageNumbers) || pageNumbers.length === 0) {
                pageNumbers = Array.from({ length: maxPages }, (_, i) => i + 1);
            }
            
            const indices = pageNumbers
                .map(n => n - 1)
                .filter(i => i >= 0 && i < maxPages);
                
            const copiedPages = await newDoc.copyPages(sourceDoc, indices);
            copiedPages.forEach(page => newDoc.addPage(page));
            
            const buffer = await newDoc.save();
            return { buffer, pageCount: newDoc.getPageCount() };
        } catch (error) {
            throw new Error(`Failed to extract pages: ${error.message}`);
        }
    }

    /**
     * Reorder pages in a PDF.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @param {number[]} newOrder - 1-indexed array of page numbers.
     * @returns {Promise<{buffer: Uint8Array, pageCount: number}>}
     */
    async reorderPages(pdfBuffer, newOrder) {
        return this.extractPages(pdfBuffer, newOrder);
    }

    /**
     * Rotate pages in a PDF.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @param {number} rotation - 90, 180, 270.
     * @param {number[]|string|null} pageNumbers - 1-indexed pages to rotate or null for all.
     * @returns {Promise<{buffer: Uint8Array, pageCount: number}>}
     */
    async rotatePages(pdfBuffer, rotation, pageNumbers = null) {
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const maxPages = doc.getPageCount();

            if (typeof pageNumbers === 'string') {
                const trimmed = pageNumbers.trim();
                if (!trimmed) {
                    pageNumbers = null;
                } else {
                    pageNumbers = trimmed.split(',').flatMap(p => {
                        const t = p.trim();
                        if (t.includes('-')) {
                            const [s, e] = t.split('-').map(Number);
                            const arr = [];
                            for (let i = s; i <= e; i++) arr.push(i);
                            return arr;
                        }
                        const n = Number(t);
                        return isNaN(n) ? [] : [n];
                    });
                }
            }
            
            let indices = [];
            if (pageNumbers && Array.isArray(pageNumbers) && pageNumbers.length > 0) {
                indices = pageNumbers.map(n => n - 1).filter(i => i >= 0 && i < maxPages);
            } else {
                indices = Array.from({ length: maxPages }, (_, i) => i);
            }
            
            for (const idx of indices) {
                const page = doc.getPage(idx);
                const currentRotation = page.getRotation().angle;
                page.setRotation(degrees(currentRotation + rotation));
            }
            
            const buffer = await doc.save();
            return { buffer, pageCount: doc.getPageCount() };
        } catch (error) {
            throw new Error(`Failed to rotate pages: ${error.message}`);
        }
    }

    /**
     * Delete pages from a PDF.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @param {number[]} pageNumbers - 1-indexed page numbers to delete.
     * @returns {Promise<{buffer: Uint8Array, pageCount: number}>}
     */
    async deletePages(pdfBuffer, pageNumbers) {
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const maxPages = doc.getPageCount();
            
            const indicesToDelete = new Set(
                pageNumbers.map(n => n - 1).filter(i => i >= 0 && i < maxPages)
            );
            
            const sortedIndices = Array.from(indicesToDelete).sort((a, b) => b - a);
            for (const idx of sortedIndices) {
                doc.removePage(idx);
            }
            
            const buffer = await doc.save();
            return { buffer, pageCount: doc.getPageCount() };
        } catch (error) {
            throw new Error(`Failed to delete pages: ${error.message}`);
        }
    }

    /**
     * Duplicate specific pages.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @param {number[]} pageNumbers - 1-indexed pages to duplicate.
     * @returns {Promise<{buffer: Uint8Array, pageCount: number}>}
     */
    async duplicatePages(pdfBuffer, pageNumbers) {
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const maxPages = doc.getPageCount();
            
            const indicesToDuplicate = pageNumbers.map(n => n - 1).filter(i => i >= 0 && i < maxPages);
            const copiedPages = await doc.copyPages(doc, indicesToDuplicate);
            
            // Insert after each original page (requires sorting and keeping track of offsets)
            // For simplicity, we can insert them at the end or right after.
            // Let's insert right after, working backwards
            let offset = 0;
            for (let i = 0; i < indicesToDuplicate.length; i++) {
                const originalIndex = indicesToDuplicate[i];
                // In a robust implementation, if we duplicate page 1 and 2, 
                // we insert duplicate of 1 at index 2, duplicate of 2 at index 4.
                // Simple approach: just add all duplicates at the end for now, or insert them.
                doc.insertPage(originalIndex + 1 + offset, copiedPages[i]);
                offset++;
            }
            
            const buffer = await doc.save();
            return { buffer, pageCount: doc.getPageCount() };
        } catch (error) {
            throw new Error(`Failed to duplicate pages: ${error.message}`);
        }
    }

    /**
     * Add text watermark.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @param {string} text - Watermark text.
     * @param {object} options - Options.
     * @returns {Promise<{buffer: Uint8Array}>}
     */
    async addTextWatermark(pdfBuffer, text, options = {}) {
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const font = await doc.embedFont(StandardFonts.HelveticaBold);
            const pages = doc.getPages();
            
            const fontSize = options.fontSize || 40;
            const opacity = options.opacity !== undefined ? options.opacity : 0.3;
            const rotation = options.rotation || -45;
            const colorOpts = options.color || { r: 0.5, g: 0.5, b: 0.5 };
            const textColor = rgb(colorOpts.r, colorOpts.g, colorOpts.b);
            
            const targetPages = options.pageNumbers 
                ? options.pageNumbers.map(n => n - 1).filter(i => i >= 0 && i < pages.length)
                : Array.from({ length: pages.length }, (_, i) => i);
                
            for (const idx of targetPages) {
                const page = pages[idx];
                const { width, height } = page.getSize();
                
                page.drawText(text, {
                    x: width / 2 - (text.length * fontSize / 4), // rough centering
                    y: height / 2,
                    size: fontSize,
                    font: font,
                    color: textColor,
                    rotate: degrees(rotation),
                    opacity: opacity
                });
            }
            
            const buffer = await doc.save();
            return { buffer };
        } catch (error) {
            throw new Error(`Failed to add watermark: ${error.message}`);
        }
    }

    /**
     * Add page numbers to a PDF.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @param {object} options - Options.
     * @returns {Promise<{buffer: Uint8Array}>}
     */
    async addPageNumbers(pdfBuffer, options = {}) {
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const font = await doc.embedFont(StandardFonts.Helvetica);
            const pages = doc.getPages();
            const total = pages.length;
            
            const startFrom = options.startFrom || 1;
            const fontSize = options.fontSize || 10;
            const format = options.format || 'Page {n} of {total}';
            const position = options.position || 'bottom-center';
            
            for (let i = 0; i < total; i++) {
                const page = pages[i];
                const { width, height } = page.getSize();
                const pageNum = startFrom + i;
                
                const text = format.replace('{n}', pageNum).replace('{total}', total);
                let x = width / 2;
                let y = 30; // bottom
                
                if (position === 'bottom-right') {
                    x = width - 100;
                } else if (position === 'top-right') {
                    x = width - 100;
                    y = height - 30;
                }
                
                page.drawText(text, {
                    x,
                    y,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0)
                });
            }
            
            const buffer = await doc.save();
            return { buffer };
        } catch (error) {
            throw new Error(`Failed to add page numbers: ${error.message}`);
        }
    }

    /**
     * Add header and footer to a PDF.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @param {object} options - Options.
     * @returns {Promise<{buffer: Uint8Array}>}
     */
    async addHeaderFooter(pdfBuffer, options = {}) {
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const font = await doc.embedFont(StandardFonts.Helvetica);
            const pages = doc.getPages();
            
            const fontSize = options.fontSize || 9;
            const header = options.header || '';
            const footer = options.footer || '';
            
            for (const page of pages) {
                const { width, height } = page.getSize();
                
                if (header) {
                    page.drawText(header, {
                        x: 50,
                        y: height - 30,
                        size: fontSize,
                        font: font,
                        color: rgb(0, 0, 0)
                    });
                }
                
                if (footer) {
                    page.drawText(footer, {
                        x: 50,
                        y: 30,
                        size: fontSize,
                        font: font,
                        color: rgb(0, 0, 0)
                    });
                }
            }
            
            const buffer = await doc.save();
            return { buffer };
        } catch (error) {
            throw new Error(`Failed to add header/footer: ${error.message}`);
        }
    }

    /**
     * Get PDF metadata.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @returns {Promise<object>}
     */
    async getMetadata(pdfBuffer) {
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            return {
                title: doc.getTitle() || '',
                author: doc.getAuthor() || '',
                subject: doc.getSubject() || '',
                creator: doc.getCreator() || '',
                producer: doc.getProducer() || '',
                creationDate: doc.getCreationDate(),
                modificationDate: doc.getModificationDate(),
                pageCount: doc.getPageCount(),
                isEncrypted: doc.isEncrypted,
                hasText: false, // will be evaluated via pdf-parse if needed
                fileSize: pdfBuffer.length
            };
        } catch (error) {
            throw new Error(`Failed to get metadata: ${error.message}`);
        }
    }

    /**
     * Set PDF metadata.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @param {object} metadata - The metadata to set.
     * @returns {Promise<{buffer: Uint8Array}>}
     */
    async setMetadata(pdfBuffer, metadata) {
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            
            if (metadata.title !== undefined) doc.setTitle(metadata.title);
            if (metadata.author !== undefined) doc.setAuthor(metadata.author);
            if (metadata.subject !== undefined) doc.setSubject(metadata.subject);
            if (metadata.keywords !== undefined) doc.setKeywords(metadata.keywords);
            if (metadata.creator !== undefined) doc.setCreator(metadata.creator);
            
            const buffer = await doc.save();
            return { buffer };
        } catch (error) {
            throw new Error(`Failed to set metadata: ${error.message}`);
        }
    }

    /**
     * Extract text from a PDF.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @returns {Promise<{text: string, pageCount: number, info: object, hasText: boolean}>}
     */
    async extractText(pdfBuffer) {
        return new Promise((resolve) => {
            try {
                const PDFParser = require('pdf2json');
                const os = require('os');
                const path = require('path');
                const nodeFs = require('fs');

                const tempPath = path.join(os.tmpdir(), `pdf-extract-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
                nodeFs.writeFileSync(tempPath, Buffer.from(pdfBuffer));

                const parser = new PDFParser();
                parser.on('pdfParser_dataReady', (pdfData) => {
                    try { nodeFs.unlinkSync(tempPath); } catch (_) {}
                    let text = '';
                    for (const page of (pdfData.Pages || [])) {
                        for (const t of (page.Texts || [])) {
                            for (const r of (t.R || [])) {
                                try {
                                    text += decodeURIComponent(r.T || '') + ' ';
                                } catch (_) {
                                    text += (r.T || '') + ' ';
                                }
                            }
                        }
                        text += '\n';
                    }
                    const trimmed = text.trim();
                    resolve({
                        text: trimmed,
                        pageCount: (pdfData.Pages || []).length,
                        info: pdfData.Meta || {},
                        hasText: trimmed.length > 0
                    });
                });
                parser.on('pdfParser_dataError', (err) => {
                    try { nodeFs.unlinkSync(tempPath); } catch (_) {}
                    resolve({ text: '', pageCount: 0, info: {}, hasText: false, error: err.parserError });
                });
                parser.loadPDF(tempPath);
            } catch (error) {
                resolve({ text: '', pageCount: 0, info: {}, hasText: false, error: error.message });
            }
        });
    }

    /**
     * Get basic page information for thumbnail generation.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @returns {Promise<Array<{pageNumber: number, width: number, height: number, rotation: number}>>}
     */
    async getPageThumbnailData(pdfBuffer) {
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const pages = doc.getPages();
            
            return pages.map((page, index) => {
                const { width, height } = page.getSize();
                const rotation = page.getRotation().angle;
                return {
                    pageNumber: index + 1,
                    width,
                    height,
                    rotation
                };
            });
        } catch (error) {
            throw new Error(`Failed to get page thumbnail data: ${error.message}`);
        }
    }

    /**
     * Check security properties of a PDF.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @returns {Promise<{isEncrypted: boolean, hasPassword: boolean, permissions: object}>}
     */
    async checkSecurity(pdfBuffer) {
        try {
            // pdf-lib currently provides limited security detection.
            // We can detect if it's encrypted.
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            
            return {
                isEncrypted: doc.isEncrypted,
                hasPassword: doc.isEncrypted, // basic assumption for now
                permissions: {} // Not fully supported by pdf-lib without extensions
            };
        } catch (error) {
            if (error.message.includes('encrypted')) {
                return {
                    isEncrypted: true,
                    hasPassword: true,
                    permissions: {}
                };
            }
            throw new Error(`Failed to check security: ${error.message}`);
        }
    }

    /**
     * Compress and optimize a PDF document.
     * @param {Uint8Array} pdfBuffer - The PDF buffer.
     * @returns {Promise<{buffer: Uint8Array, originalSize: number, compressedSize: number}>}
     */
    async compressPdf(pdfBuffer) {
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const buffer = await doc.save({ useObjectStreams: true });
            return {
                buffer,
                originalSize: pdfBuffer.length,
                compressedSize: buffer.length
            };
        } catch (error) {
            throw new Error(`Failed to compress PDF: ${error.message}`);
        }
    }

    /**
     * Save a PDF buffer to a file.
     * @param {Uint8Array} buffer - The PDF buffer.
     * @returns {Promise<{success: boolean, path: string, size: number}>}
     */
    async savePdf(buffer, filePath) {
        try {
            await fs.writeFile(filePath, buffer);
            return {
                success: true,
                path: filePath,
                size: buffer.length
            };
        } catch (error) {
            return {
                success: false,
                path: filePath,
                size: 0
            };
        }
    }
}

module.exports = PdfEngine;
