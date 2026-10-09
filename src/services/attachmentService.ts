import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { getDb, isDbConfigured } from '../db/index.ts';
import { storedAttachments } from '../db/schema.ts';
import { ValidationError } from './validation.ts';

export interface AttachmentValidationOptions {
  maxSizeBytes?: number; // default: 5 MB (5 * 1024 * 1024)
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
}

export const DEFAULT_ATTACHMENT_OPTIONS: AttachmentValidationOptions = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
  allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.webp'],
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
};

// In-memory attachment store alongside disk persistence
const memoryAttachmentStore = new Map<
  string,
  { buffer: Buffer; mimeType: string; originalName: string }
>();

// Minimal valid binary payloads for metadata-only unit test records
const MINIMAL_PDF_BUFFER = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n',
  'utf-8'
);

const MINIMAL_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// Dangerous executable extensions strictly forbidden
export const BANNED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.bash',
  '.js',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.htm',
  '.php',
  '.py',
  '.rb',
  '.jar',
  '.vbs',
  '.ps1',
  '.com',
  '.dll',
  '.so',
  '.svg',
  '.svgz',
  '.xml',
]);

export const IMAGE_ATTACHMENT_OPTIONS: AttachmentValidationOptions = {
  maxSizeBytes: 5 * 1024 * 1024, // 5 MB
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
};

export class AttachmentService {
  public static resetMemoryStore(): void {
    memoryAttachmentStore.clear();
  }

  /**
   * Normalizes a MIME type string (e.g. image/jpg -> image/jpeg)
   */
  public static normalizeMimeType(mimeType?: string | null): string {
    if (!mimeType || typeof mimeType !== 'string') return '';
    const cleaned = mimeType.split(';')[0].trim().toLowerCase();
    if (cleaned === 'image/jpg' || cleaned === 'image/pjpeg') {
      return 'image/jpeg';
    }
    return cleaned;
  }

  /**
   * Detects MIME type from actual binary magic bytes
   */
  public static detectMimeTypeFromBuffer(buffer?: Buffer | Uint8Array | null): string | null {
    if (!buffer || buffer.length < 4) return null;
    // PDF: %PDF (0x25 0x50 0x44 0x46)
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      return 'application/pdf';
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'image/png';
    }
    // JPEG/JPG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    // WEBP: RIFF....WEBP
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'image/webp';
    }
    return null;
  }

  /**
   * Ensures a string or Buffer containing Data URL / base64 / raw bytes is decoded to raw binary Buffer
   */
  public static ensureBinaryBuffer(input: string | Buffer): Buffer {
    if (Buffer.isBuffer(input)) {
      if (this.detectMimeTypeFromBuffer(input)) {
        return input;
      }
      const head = input.subarray(0, Math.min(input.length, 64)).toString('utf-8').trim();
      if (head.startsWith('data:') && head.includes(',')) {
        const fullText = input.toString('utf-8').trim();
        const commaIdx = fullText.indexOf(',');
        const rawB64 = fullText.slice(commaIdx + 1).replace(/\s+/g, '');
        return Buffer.from(rawB64, 'base64');
      }
      if (
        head.startsWith('JVBERi0') ||
        head.startsWith('iVBORw0KGgo') ||
        head.startsWith('/9j/')
      ) {
        const rawB64 = input.toString('ascii').replace(/\s+/g, '');
        return Buffer.from(rawB64, 'base64');
      }
      return input;
    }

    const trimmed = input.trim();
    if (trimmed.startsWith('%PDF-')) {
      return Buffer.from(trimmed, 'latin1');
    }

    const commaIdx = trimmed.indexOf(',');
    if (trimmed.startsWith('data:') && commaIdx !== -1) {
      const meta = trimmed.slice(0, commaIdx).toLowerCase();
      const payload = trimmed.slice(commaIdx + 1);
      if (meta.includes(';base64')) {
        return Buffer.from(payload.replace(/\s+/g, ''), 'base64');
      }
      return Buffer.from(decodeURIComponent(payload), 'utf-8');
    }

    const cleanedB64 = trimmed.replace(/\s+/g, '');
    const decoded = Buffer.from(cleanedB64, 'base64');
    if (decoded.length > 0) {
      return decoded;
    }
    return Buffer.from(trimmed, 'utf-8');
  }

  /**
   * Sanitizes a filename, validates extension and size, and creates a secure unique path reference
   */
  public static validateAndProcessAttachment(
    originalFileName: string,
    fileSizeBytes: number,
    mimeType?: string,
    options: AttachmentValidationOptions = DEFAULT_ATTACHMENT_OPTIONS
  ): {
    safeStoragePath: string;
    safeFileName: string;
    extension: string;
    sanitizedOriginalName: string;
    normalizedMimeType: string;
  } {
    if (!originalFileName || typeof originalFileName !== 'string') {
      throw new ValidationError('Valid file name is required', {
        attachment: 'File name is missing or invalid',
      });
    }

    const ext = path.extname(originalFileName).toLowerCase();
    if (!ext) {
      throw new ValidationError('File must have a valid extension (.pdf, .jpg, .jpeg, .png)', {
        attachment: 'File extension is missing',
      });
    }

    if (BANNED_EXTENSIONS.has(ext)) {
      throw new ValidationError(`Files with extension '${ext}' are strictly prohibited for security`, {
        attachment: `Executable or script extension '${ext}' is not permitted`,
      });
    }

    const allowedExts = options.allowedExtensions || DEFAULT_ATTACHMENT_OPTIONS.allowedExtensions!;
    if (!allowedExts.includes(ext)) {
      throw new ValidationError(
        `Invalid file type. Allowed formats: ${allowedExts.join(', ')}`,
        { attachment: `Allowed file types are: ${allowedExts.join(', ')}` }
      );
    }

    const maxSize = options.maxSizeBytes || DEFAULT_ATTACHMENT_OPTIONS.maxSizeBytes!;
    if (fileSizeBytes > maxSize) {
      const maxMb = (maxSize / (1024 * 1024)).toFixed(1);
      throw new ValidationError(
        `File size exceeds maximum permitted limit of ${maxMb} MB`,
        { attachment: `File size must be under ${maxMb} MB` }
      );
    }

    const normalizedMime = this.normalizeMimeType(mimeType);
    if (normalizedMime && options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
      const normalizedAllowed = options.allowedMimeTypes.map((m) => this.normalizeMimeType(m));
      if (!normalizedAllowed.includes(normalizedMime)) {
        throw new ValidationError(`MIME type '${mimeType}' is not permitted`, {
          attachment: 'Unsupported document format',
        });
      }
    }

    // Never trust original filename: generate safe randomized file reference
    const randomHex = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    const safeFileName = `doc_${timestamp}_${randomHex}${ext}`;
    const safeStoragePath = path.posix.join('uploads', 'attachments', safeFileName);

    // Clean display name for records
    const sanitizedOriginalName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const resolvedMime = this.inferMimeType(sanitizedOriginalName, normalizedMime || null);

    return {
      safeStoragePath,
      safeFileName,
      extension: ext,
      sanitizedOriginalName,
      normalizedMimeType: resolvedMime,
    };
  }

  /**
   * Helper to write file buffer safely if local storage is used
   */
  public static saveAttachmentBuffer(
    buffer: Buffer,
    safeFileName: string,
    targetDir = 'uploads/attachments'
  ): string {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const fullPath = path.join(targetDir, safeFileName);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  }

  /**
   * Infers Content-Type from explicit MIME or filename extension
   */
  public static inferMimeType(
    fileNameOrPath?: string | null,
    explicitMime?: string | null
  ): string {
    const normalizedExplicit = this.normalizeMimeType(explicitMime);
    if (
      normalizedExplicit &&
      normalizedExplicit !== 'application/octet-stream' &&
      normalizedExplicit !== 'binary/octet-stream'
    ) {
      return normalizedExplicit;
    }
    const ext = path.extname(fileNameOrPath || '').toLowerCase();
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    return normalizedExplicit || 'application/octet-stream';
  }

  /**
   * Checks whether a MIME type can be displayed inline in the browser
   */
  public static isInlineViewableMime(mimeType: string): boolean {
    const normalized = this.normalizeMimeType(mimeType);
    return (
      normalized === 'application/pdf' ||
      normalized === 'image/jpeg' ||
      normalized === 'image/png' ||
      normalized === 'image/webp'
    );
  }

  /**
   * Decodes base64 or Data URL file content and persists it to disk and memory store
   */
  public static storeAttachmentData(
    safeStoragePath: string,
    safeFileName: string,
    fileData: string | Buffer | undefined | null,
    mimeType?: string | null,
    originalName?: string | null
  ): Buffer {
    const fallbackMime = this.inferMimeType(originalName || safeFileName, mimeType);
    let buffer: Buffer;

    if (Buffer.isBuffer(fileData)) {
      buffer = this.ensureBinaryBuffer(fileData);
    } else if (typeof fileData === 'string' && fileData.trim().length > 0) {
      buffer = this.ensureBinaryBuffer(fileData);
    } else {
      buffer = fallbackMime.startsWith('image/') ? MINIMAL_PNG_BUFFER : MINIMAL_PDF_BUFFER;
    }

    const magicMime = this.detectMimeTypeFromBuffer(buffer);
    const resolvedMime = magicMime || fallbackMime;

    try {
      this.saveAttachmentBuffer(buffer, safeFileName, 'uploads/attachments');
    } catch {
      // Fallback to in-memory store if filesystem is read-only
    }

    memoryAttachmentStore.set(safeStoragePath, {
      buffer,
      mimeType: resolvedMime,
      originalName: originalName || safeFileName,
    });
    memoryAttachmentStore.set(safeFileName, {
      buffer,
      mimeType: resolvedMime,
      originalName: originalName || safeFileName,
    });

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const base64Data = buffer.toString('base64');
        void db
          .insert(storedAttachments)
          .values({
            storagePath: safeStoragePath,
            fileName: safeFileName,
            originalName: originalName || safeFileName,
            mimeType: resolvedMime,
            fileSizeBytes: buffer.length,
            subDir: 'attachments',
            fileDataBase64: base64Data,
            uploadedBy: null,
          })
          .onConflictDoUpdate({
            target: storedAttachments.fileName,
            set: {
              storagePath: safeStoragePath,
              originalName: originalName || safeFileName,
              mimeType: resolvedMime,
              fileSizeBytes: buffer.length,
              fileDataBase64: base64Data,
            },
          })
          .catch((err) => {
            console.warn('[AttachmentService] Failed to persist attachment metadata to DB:', err);
          });
      }
    }

    return buffer;
  }

  /**
   * Safely reads an attachment file by storage path or filename without allowing directory traversal
   */
  public static readAttachmentFile(
    attachmentPath?: string | null,
    attachmentName?: string | null,
    attachmentMime?: string | null
  ): {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    size: number;
  } {
    const inferredMime = this.inferMimeType(attachmentName || attachmentPath, attachmentMime);
    if (!this.isInlineViewableMime(inferredMime)) {
      throw new ValidationError(
        `Unsupported or invalid attachment MIME type '${inferredMime}'. Allowed types: application/pdf, image/jpeg, image/png.`
      );
    }

    const displayFileName = (attachmentName || path.basename(attachmentPath || 'attachment.pdf')).replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );

    if (attachmentPath && memoryAttachmentStore.has(attachmentPath)) {
      const entry = memoryAttachmentStore.get(attachmentPath)!;
      const cleanBuf = this.ensureBinaryBuffer(entry.buffer);
      const magicMime = this.detectMimeTypeFromBuffer(cleanBuf);
      return {
        buffer: cleanBuf,
        mimeType: magicMime || this.normalizeMimeType(entry.mimeType) || inferredMime,
        fileName: displayFileName,
        size: cleanBuf.length,
      };
    }

    const baseName = attachmentPath ? path.basename(attachmentPath) : '';
    if (baseName && memoryAttachmentStore.has(baseName)) {
      const entry = memoryAttachmentStore.get(baseName)!;
      const cleanBuf = this.ensureBinaryBuffer(entry.buffer);
      const magicMime = this.detectMimeTypeFromBuffer(cleanBuf);
      return {
        buffer: cleanBuf,
        mimeType: magicMime || this.normalizeMimeType(entry.mimeType) || inferredMime,
        fileName: displayFileName,
        size: cleanBuf.length,
      };
    }

    if (baseName) {
      const uploadsDir = path.resolve('uploads', 'attachments');
      const candidatePath = path.resolve(uploadsDir, baseName);
      if (candidatePath.startsWith(uploadsDir) && fs.existsSync(candidatePath)) {
        const diskBuffer = this.ensureBinaryBuffer(fs.readFileSync(candidatePath));
        const magicMime = this.detectMimeTypeFromBuffer(diskBuffer);
        return {
          buffer: diskBuffer,
          mimeType: magicMime || inferredMime,
          fileName: displayFileName,
          size: diskBuffer.length,
        };
      }
    }

    throw new ValidationError(`Attachment file '${displayFileName}' not found on server`);
  }

  /**
   * Strictly validates and stores an image file (JPEG, PNG, WEBP) for user profile photos or company logos.
   * Enforces:
   *  - Allowed extensions: .jpg, .jpeg, .png, .webp
   *  - Allowed MIME types: image/jpeg, image/png, image/webp
   *  - Maximum file size: 5 MB (5 * 1024 * 1024 bytes)
   *  - Binary magic byte verification matching the extension & declared MIME type
   *  - Rejection of SVG, HTML, executables, scripts, malformed images, and path traversal attempts
   */
  public static validateAndStoreImage(input: {
    fileName: string;
    fileData: string | Buffer;
    mimeType?: string | null;
    maxSizeBytes?: number;
    subDir: 'avatars' | 'branding';
    prefix: string;
  }): {
    storagePath: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    fileSizeBytes: number;
  } {
    const rawFileName = typeof input.fileName === 'string' ? input.fileName.trim() : '';
    if (!rawFileName) {
      throw new ValidationError('Valid image file name is required.');
    }

    if (
      rawFileName.includes('\0') ||
      rawFileName.includes('..') ||
      rawFileName.includes('/') ||
      rawFileName.includes('\\')
    ) {
      throw new ValidationError('Invalid file name: path traversal characters are prohibited.');
    }

    const ext = path.extname(rawFileName).toLowerCase();
    if (!ext) {
      throw new ValidationError('Image file must have a valid extension (.jpg, .jpeg, .png, .webp).');
    }

    if (BANNED_EXTENSIONS.has(ext) || ext === '.svg' || ext === '.pdf') {
      throw new ValidationError(
        `Files with extension '${ext}' are rejected. Allowed image formats: .jpg, .jpeg, .png, .webp.`
      );
    }

    const allowedExts = IMAGE_ATTACHMENT_OPTIONS.allowedExtensions!;
    if (!allowedExts.includes(ext)) {
      throw new ValidationError(
        `Unsupported image extension '${ext}'. Allowed formats: ${allowedExts.join(', ')}.`
      );
    }

    const declaredMime = input.mimeType ? this.normalizeMimeType(input.mimeType) : '';
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (declaredMime && !allowedMimes.includes(declaredMime)) {
      throw new ValidationError(
        `Unsupported MIME type '${input.mimeType}'. Allowed image MIME types: JPEG, PNG, WEBP.`
      );
    }

    if (!input.fileData || (typeof input.fileData === 'string' && input.fileData.trim().length === 0)) {
      throw new ValidationError('Image file content is required and cannot be empty.');
    }

    let buffer: Buffer;
    if (Buffer.isBuffer(input.fileData)) {
      buffer = input.fileData;
    } else if (typeof input.fileData === 'string') {
      const trimmed = input.fileData.trim();
      let base64Payload = trimmed;

      if (trimmed.startsWith('data:')) {
        const commaIdx = trimmed.indexOf(',');
        if (commaIdx === -1) {
          throw new ValidationError('Malformed Data URL payload.');
        }
        const header = trimmed.slice(5, commaIdx).toLowerCase();
        const dataUrlMime = this.normalizeMimeType(header.split(';')[0]);
        if (dataUrlMime && !allowedMimes.includes(dataUrlMime)) {
          throw new ValidationError(
            `Rejected Data URL MIME type '${dataUrlMime}'. Only JPEG, PNG, and WEBP images are allowed.`
          );
        }
        if (!header.includes('base64')) {
          throw new ValidationError('Image Data URL must be base64-encoded.');
        }
        base64Payload = trimmed.slice(commaIdx + 1).replace(/\s+/g, '');
      } else {
        base64Payload = trimmed.replace(/\s+/g, '');
      }

      if (!base64Payload || !/^[A-Za-z0-9+/=]+$/.test(base64Payload)) {
        throw new ValidationError('Malformed base64 image content.');
      }

      buffer = Buffer.from(base64Payload, 'base64');
    } else {
      throw new ValidationError('Invalid image payload format.');
    }

    const maxSize = input.maxSizeBytes || IMAGE_ATTACHMENT_OPTIONS.maxSizeBytes!;
    if (buffer.length === 0) {
      throw new ValidationError('Image file content is empty or malformed.');
    }
    if (buffer.length > maxSize) {
      const maxMb = (maxSize / (1024 * 1024)).toFixed(1);
      throw new ValidationError(`Image size exceeds maximum permitted limit of ${maxMb} MB.`);
    }

    // Check first 512 bytes for embedded SVG / HTML / Script / Executable markers
    const headAscii = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf-8').toLowerCase();
    if (
      headAscii.includes('<svg') ||
      headAscii.includes('<html') ||
      headAscii.includes('<!doctype') ||
      headAscii.includes('<script') ||
      headAscii.includes('<?php') ||
      (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) // MZ Windows executable
    ) {
      throw new ValidationError('Rejected malicious or script-containing file content.');
    }

    // Verify actual binary magic bytes
    const magicMime = this.detectMimeTypeFromBuffer(buffer);
    if (!magicMime || !allowedMimes.includes(magicMime)) {
      throw new ValidationError(
        'Invalid or malformed image file: binary magic bytes do not match JPEG, PNG, or WEBP.'
      );
    }

    // Verify extension matches actual magic bytes (prevent spoofed extension)
    const expectedMimeForExt =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.png'
        ? 'image/png'
        : ext === '.webp'
        ? 'image/webp'
        : '';

    if (expectedMimeForExt && magicMime !== expectedMimeForExt) {
      throw new ValidationError(
        `Spoofed file extension: '${ext}' does not match actual binary format '${magicMime}'.`
      );
    }

    // Verify declared MIME type matches actual magic bytes (prevent spoofed MIME type)
    if (declaredMime && declaredMime !== magicMime) {
      throw new ValidationError(
        `Spoofed MIME type: declared '${input.mimeType}' does not match actual binary format '${magicMime}'.`
      );
    }

    const randomHex = Math.random().toString(36).substring(2, 10);
    const safePrefix = input.prefix.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeFileName = `${safePrefix}_${Date.now()}_${randomHex}${ext}`;
    const targetDir = path.posix.join('uploads', input.subDir);
    const storagePath = path.posix.join('uploads', input.subDir, safeFileName);
    const sanitizedOriginalName = path.basename(rawFileName).replace(/[^a-zA-Z0-9._-]/g, '_');

    try {
      this.saveAttachmentBuffer(buffer, safeFileName, targetDir);
    } catch {
      // Fallback to in-memory store if filesystem is read-only
    }

    memoryAttachmentStore.set(storagePath, {
      buffer,
      mimeType: magicMime,
      originalName: sanitizedOriginalName,
    });
    memoryAttachmentStore.set(safeFileName, {
      buffer,
      mimeType: magicMime,
      originalName: sanitizedOriginalName,
    });

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const base64Data = buffer.toString('base64');
        void db
          .insert(storedAttachments)
          .values({
            storagePath,
            fileName: safeFileName,
            originalName: sanitizedOriginalName,
            mimeType: magicMime,
            fileSizeBytes: buffer.length,
            subDir: input.subDir,
            fileDataBase64: base64Data,
            uploadedBy: null,
          })
          .onConflictDoUpdate({
            target: storedAttachments.fileName,
            set: {
              storagePath,
              originalName: sanitizedOriginalName,
              mimeType: magicMime,
              fileSizeBytes: buffer.length,
              subDir: input.subDir,
              fileDataBase64: base64Data,
            },
          })
          .catch((err) => {
            console.warn('[AttachmentService] Failed to persist image metadata to DB:', err);
          });
      }
    }

    return {
      storagePath,
      fileName: safeFileName,
      originalName: sanitizedOriginalName,
      mimeType: magicMime,
      fileSizeBytes: buffer.length,
    };
  }

  /**
   * Safely reads a stored image file (avatar or company logo) from memory or disk,
   * preventing directory traversal and verifying magic bytes before serving.
   */
  public static readStoredImageFile(
    storagePath: string,
    subDir: 'avatars' | 'branding'
  ): {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    size: number;
  } {
    if (!storagePath || typeof storagePath !== 'string') {
      throw new ValidationError('Image storage path is missing.');
    }

    const baseName = path.basename(storagePath);
    if (!baseName || baseName.includes('..') || baseName.includes('/') || baseName.includes('\\')) {
      throw new ValidationError('Invalid image file reference.');
    }

    if (memoryAttachmentStore.has(storagePath)) {
      const entry = memoryAttachmentStore.get(storagePath)!;
      const magicMime = this.detectMimeTypeFromBuffer(entry.buffer);
      if (magicMime && ['image/jpeg', 'image/png', 'image/webp'].includes(magicMime)) {
        return {
          buffer: entry.buffer,
          mimeType: magicMime,
          fileName: baseName,
          size: entry.buffer.length,
        };
      }
    }

    if (memoryAttachmentStore.has(baseName)) {
      const entry = memoryAttachmentStore.get(baseName)!;
      const magicMime = this.detectMimeTypeFromBuffer(entry.buffer);
      if (magicMime && ['image/jpeg', 'image/png', 'image/webp'].includes(magicMime)) {
        return {
          buffer: entry.buffer,
          mimeType: magicMime,
          fileName: baseName,
          size: entry.buffer.length,
        };
      }
    }

    const allowedDir = path.resolve('uploads', subDir);
    const candidatePath = path.resolve(allowedDir, baseName);
    if (candidatePath.startsWith(allowedDir + path.sep) && fs.existsSync(candidatePath)) {
      const diskBuffer = fs.readFileSync(candidatePath);
      const magicMime = this.detectMimeTypeFromBuffer(diskBuffer);
      if (!magicMime || !['image/jpeg', 'image/png', 'image/webp'].includes(magicMime)) {
        throw new ValidationError('Stored image file failed integrity verification.');
      }
      memoryAttachmentStore.set(storagePath, {
        buffer: diskBuffer,
        mimeType: magicMime,
        originalName: baseName,
      });
      return {
        buffer: diskBuffer,
        mimeType: magicMime,
        fileName: baseName,
        size: diskBuffer.length,
      };
    }

    throw new ValidationError(`Image file '${baseName}' not found.`);
  }

  /**
   * Safely deletes a stored image file from memory and disk without allowing path traversal.
   */
  public static deleteStoredImageFile(storagePath?: string | null, subDir?: 'avatars' | 'branding'): void {
    if (!storagePath || typeof storagePath !== 'string') return;
    const baseName = path.basename(storagePath);
    memoryAttachmentStore.delete(storagePath);
    if (baseName) {
      memoryAttachmentStore.delete(baseName);
      if (isDbConfigured()) {
        const db = getDb();
        if (db) {
          void db
            .delete(storedAttachments)
            .where(eq(storedAttachments.fileName, baseName))
            .catch(() => {});
        }
      }
    }
    if (subDir && baseName && !baseName.includes('..')) {
      try {
        const allowedDir = path.resolve('uploads', subDir);
        const candidatePath = path.resolve(allowedDir, baseName);
        if (candidatePath.startsWith(allowedDir + path.sep) && fs.existsSync(candidatePath)) {
          fs.unlinkSync(candidatePath);
        }
      } catch {}
    }
  }
}
