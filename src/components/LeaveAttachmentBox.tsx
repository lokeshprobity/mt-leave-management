import React, { useState, useEffect, useRef } from 'react';
import {
  Paperclip,
  Eye,
  Download,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  X,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - worker module exports WorkerMessageHandler
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';
import { apiFetch } from '../lib/api.ts';

if (typeof globalThis !== 'undefined' && !(globalThis as any).pdfjsWorker) {
  (globalThis as any).pdfjsWorker = pdfjsWorker;
}

interface LeaveAttachmentBoxProps {
  requestId: number;
  attachmentName?: string | null;
  attachmentPath?: string | null;
  attachmentSize?: number | null;
  attachmentMime?: string | null;
  compact?: boolean;
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatFileType(mime?: string | null, fileName?: string | null): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('pdf')) return 'PDF Document';
  if (m.includes('png')) return 'PNG Image';
  if (m.includes('jpeg') || m.includes('jpg')) return 'JPEG Image';
  if (m.includes('webp')) return 'WEBP Image';
  const ext = (fileName || '').split('.').pop()?.toUpperCase();
  if (ext && ext !== fileName?.toUpperCase()) return `${ext} File`;
  return 'Document';
}

export function isSupportedPreviewFormat(mime?: string | null, fileName?: string | null): boolean {
  const m = (mime || '').toLowerCase().trim();
  if (
    m === 'application/pdf' ||
    m === 'image/jpeg' ||
    m === 'image/jpg' ||
    m === 'image/png' ||
    m === 'image/webp'
  ) {
    return true;
  }
  const lowerName = (fileName || '').toLowerCase();
  return (
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp')
  );
}

/**
 * Detects the true MIME type from binary magic bytes first, falling back to headers/filename.
 */
export function detectBinaryMimeType(
  bytes: Uint8Array,
  headerMime?: string | null,
  fileName?: string | null
): string {
  if (bytes && bytes.byteLength >= 4) {
    // %PDF (0x25 0x50 0x44 0x46)
    if (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    ) {
      return 'application/pdf';
    }
    // PNG (89 50 4E 47 0D 0A 1A 0A)
    if (
      bytes.byteLength >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return 'image/png';
    }
    // JPEG/JPG (FF D8 FF)
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    // WEBP (RIFF....WEBP)
    if (
      bytes.byteLength >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp';
    }
  }

  const normalizedHeader = (headerMime || '').split(';')[0].trim().toLowerCase();
  if (normalizedHeader === 'image/jpg' || normalizedHeader === 'image/pjpeg') {
    return 'image/jpeg';
  }
  if (
    normalizedHeader &&
    normalizedHeader !== 'application/octet-stream' &&
    normalizedHeader !== 'binary/octet-stream'
  ) {
    return normalizedHeader;
  }

  const lowerName = (fileName || '').toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';

  return normalizedHeader || 'application/octet-stream';
}

/**
 * Verifies that the binary payload is genuine PDF or image bytes and NOT raw base64, JSON, or HTML text.
 */
export function isValidBinaryAttachment(bytes: Uint8Array, mimeType: string): boolean {
  if (!bytes || bytes.byteLength < 4) return false;

  // Reject raw base64 strings, data URLs, JSON objects, or HTML responses masquerading as binary
  const asciiHead = String.fromCharCode(...Array.from(bytes.slice(0, Math.min(bytes.byteLength, 32)))).trim();
  if (
    asciiHead.startsWith('data:') ||
    asciiHead.startsWith('{') ||
    asciiHead.startsWith('<!DOCTYPE') ||
    asciiHead.startsWith('<!doctype') ||
    asciiHead.startsWith('<html') ||
    asciiHead.startsWith('JVBERi0') ||
    asciiHead.startsWith('iVBORw0KGgo') ||
    asciiHead.startsWith('/9j/')
  ) {
    return false;
  }

  const normalized = (mimeType || '').toLowerCase();
  if (normalized === 'application/pdf') {
    return (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    );
  }
  if (normalized === 'image/png') {
    return (
      bytes.byteLength >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (normalized === 'image/webp') {
    return (
      bytes.byteLength >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46
    );
  }
  return false;
}

interface PdfDocumentRendererProps {
  pdfBytes: Uint8Array;
  zoom: number;
  onRenderError: (msg: string) => void;
}

function PdfDocumentRenderer({ pdfBytes, zoom, onRenderError }: PdfDocumentRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [rendering, setRendering] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

    const renderPdfPages = async () => {
      if (!containerRef.current) return;
      setRendering(true);

      try {
        if (!(globalThis as any).pdfjsWorker) {
          (globalThis as any).pdfjsWorker = pdfjsWorker;
        }

        // Pass a fresh copy of Uint8Array so PDF.js worker transfer does not detach our stored buffer
        const dataCopy = new Uint8Array(pdfBytes);
        loadingTask = pdfjsLib.getDocument({
          data: dataCopy,
          useSystemFonts: true,
        });

        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        const numPages = pdfDoc.numPages;
        setPageCount(numPages);

        const host = containerRef.current;
        if (!host) return;
        host.innerHTML = '';

        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const baseScale = 1.25 * zoom;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) return;

          const displayViewport = page.getViewport({ scale: baseScale });
          const renderViewport = page.getViewport({ scale: baseScale * dpr });

          const pageWrapper = document.createElement('div');
          pageWrapper.className = 'flex flex-col items-center gap-1.5 mb-4 last:mb-0';

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(renderViewport.width);
          canvas.height = Math.floor(renderViewport.height);
          canvas.style.width = `${Math.floor(displayViewport.width)}px`;
          canvas.style.height = `${Math.floor(displayViewport.height)}px`;
          canvas.className = 'rounded-lg shadow-md border border-neutral-300 bg-white max-w-full';

          const pageCaption = document.createElement('span');
          pageCaption.className = 'text-[11px] font-medium text-neutral-500';
          pageCaption.textContent = `Page ${pageNum} of ${numPages}`;

          pageWrapper.appendChild(canvas);
          pageWrapper.appendChild(pageCaption);
          host.appendChild(pageWrapper);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Canvas 2D context unavailable for PDF rendering.');
          }

          await page.render({
            canvas,
            canvasContext: ctx,
            viewport: renderViewport,
          }).promise;
        }

        if (!cancelled) {
          setRendering(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setRendering(false);
          onRenderError(
            err?.message || 'Unable to render PDF preview. Please download the file to view it.'
          );
        }
      }
    };

    renderPdfPages();

    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy().catch(() => {});
      }
    };
  }, [pdfBytes, zoom, onRenderError]);

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="w-full max-w-[760px] bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2 flex items-center justify-between text-xs text-emerald-800">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            PDF Document Preview {pageCount > 0 ? `(${pageCount} page${pageCount > 1 ? 's' : ''})` : ''}
          </span>
        </div>
        {rendering && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Rendering PDF...
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        data-testid="pdf-canvas-container"
        className="w-full overflow-auto flex flex-col items-center py-1"
      />
    </div>
  );
}

export function LeaveAttachmentBox({
  requestId,
  attachmentName,
  attachmentPath,
  attachmentSize,
  attachmentMime,
  compact = false,
}: LeaveAttachmentBoxProps) {
  const [loadingAction, setLoadingAction] = useState<'view' | 'download' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewRenderError, setPreviewRenderError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [previewState, setPreviewState] = useState<{
    blobUrl: string;
    mimeType: string;
    fileName: string;
    size: number;
    supported: boolean;
    pdfBytes?: Uint8Array;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (previewState?.blobUrl) {
        URL.revokeObjectURL(previewState.blobUrl);
      }
    };
  }, [previewState]);

  if (!attachmentName && !attachmentPath) {
    return null;
  }

  const displayFileName =
    attachmentName || attachmentPath?.split('/').pop() || `attachment-${requestId}.pdf`;
  const fileTypeLabel = formatFileType(attachmentMime, displayFileName);
  const fileSizeLabel = formatFileSize(attachmentSize);

  const handleViewOpen = async () => {
    setErrorMessage(null);
    setPreviewRenderError(null);
    setLoadingAction('view');
    setZoom(1);
    try {
      const res = await apiFetch(`/api/leave-requests/${requestId}/attachment?mode=inline`, {
        headers: { Accept: 'application/pdf,image/jpeg,image/png,image/webp,*/*' },
      });
      if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData?.error || 'Forbidden: You are not authorized to preview this attachment.'
        );
      }
      if (res.status === 404) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData?.error || 'Attachment file was not found on the server.'
        );
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData?.error || 'Unable to open attachment. Please try downloading the file.'
        );
      }

      const rawContentType = (res.headers.get('content-type') || '').toLowerCase();
      if (
        rawContentType.includes('text/html') ||
        rawContentType.includes('application/json') ||
        rawContentType.includes('text/plain')
      ) {
        throw new Error('Unable to preview attachment: unexpected non-binary response from server.');
      }

      const arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('Attachment file is empty or could not be read.');
      }

      const bytes = new Uint8Array(arrayBuffer);
      const effectiveMime = detectBinaryMimeType(
        bytes,
        rawContentType || attachmentMime,
        displayFileName
      );
      const isValidBinary = isValidBinaryAttachment(bytes, effectiveMime);
      const supported = isSupportedPreviewFormat(effectiveMime, displayFileName) && isValidBinary;

      if (previewState?.blobUrl) {
        URL.revokeObjectURL(previewState.blobUrl);
      }

      const typedBlob = new Blob([arrayBuffer], { type: effectiveMime });
      const blobUrl = URL.createObjectURL(typedBlob);

      setPreviewState({
        blobUrl,
        mimeType: effectiveMime,
        fileName: displayFileName,
        size: arrayBuffer.byteLength || attachmentSize || 0,
        supported,
        pdfBytes: effectiveMime === 'application/pdf' && isValidBinary ? bytes : undefined,
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to open attachment. Please try downloading the file.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDownload = async () => {
    setErrorMessage(null);
    setLoadingAction('download');
    try {
      const res = await apiFetch(`/api/leave-requests/${requestId}/attachment?mode=download`, {
        headers: { Accept: '*/*' },
      });
      if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData?.error || 'Forbidden: You are not authorized to download this attachment.'
        );
      }
      if (res.status === 404) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData?.error || 'Attachment file was not found on the server.'
        );
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData?.error || 'Unable to download attachment.'
        );
      }

      const rawContentType = (res.headers.get('content-type') || '').toLowerCase();
      if (rawContentType.includes('text/html') || rawContentType.includes('application/json')) {
        throw new Error('Unable to download attachment: invalid file response.');
      }

      const arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('Unable to download attachment: file is empty.');
      }

      const bytes = new Uint8Array(arrayBuffer);
      const effectiveMime = detectBinaryMimeType(
        bytes,
        rawContentType || attachmentMime,
        displayFileName
      );
      const blob = new Blob([arrayBuffer], { type: effectiveMime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = displayFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to open attachment. Please try downloading the file.');
    } finally {
      setLoadingAction(null);
    }
  };

  const closePreview = () => {
    if (previewState?.blobUrl) {
      URL.revokeObjectURL(previewState.blobUrl);
    }
    setPreviewRenderError(null);
    setPreviewState(null);
  };

  return (
    <div className={compact ? 'mt-1.5' : 'pt-2'}>
      <div className="p-2.5 bg-white rounded-lg border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-md bg-neutral-100 text-neutral-600 shrink-0">
            {fileTypeLabel.includes('Image') ? (
              <ImageIcon className="w-4 h-4" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div
              className="text-xs font-semibold text-neutral-900 truncate"
              title={displayFileName}
            >
              {displayFileName}
            </div>
            <div className="text-[11px] text-neutral-500 flex items-center gap-1.5 flex-wrap">
              <span>{fileTypeLabel}</span>
              {fileSizeLabel && (
                <>
                  <span>&bull;</span>
                  <span>{fileSizeLabel}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            id={`btn-view-attachment-${requestId}`}
            onClick={handleViewOpen}
            disabled={loadingAction !== null}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-red-700 text-white hover:bg-red-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{loadingAction === 'view' ? 'Opening...' : 'View / Open'}</span>
          </button>
          <button
            type="button"
            id={`btn-download-attachment-${requestId}`}
            onClick={handleDownload}
            disabled={loadingAction !== null}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-neutral-100 text-neutral-800 border border-neutral-200 hover:bg-neutral-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{loadingAction === 'download' ? 'Downloading...' : 'Download'}</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {previewState && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60]"
          role="dialog"
          aria-modal="true"
          aria-label={`Attachment Preview: ${previewState.fileName}`}
        >
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-neutral-700 shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-neutral-900 truncate">
                    {previewState.fileName}
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    {formatFileType(previewState.mimeType, previewState.fileName)}{' '}
                    {previewState.size ? `• ${formatFileSize(previewState.size)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {previewState.supported && !previewRenderError && (
                  <div className="hidden sm:flex items-center gap-1 mr-2 bg-white border border-neutral-200 rounded-lg px-1.5 py-0.5">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}
                      className="p-1 text-neutral-600 hover:text-neutral-900 cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-medium text-neutral-700 px-1">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(2.0, +(z + 0.2).toFixed(1)))}
                      className="p-1 text-neutral-600 hover:text-neutral-900 cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-700 text-white hover:bg-red-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  id={`btn-close-preview-${requestId}`}
                  onClick={closePreview}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/70 cursor-pointer"
                  title="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 bg-neutral-100 flex-1 overflow-auto flex flex-col items-center justify-center min-h-[420px]">
              {!previewState.supported || previewRenderError ? (
                <div className="text-center p-8 bg-white rounded-xl border border-neutral-200 max-w-md shadow-xs">
                  <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-2.5" />
                  <p className="text-sm font-semibold text-neutral-900">
                    {previewRenderError || 'Preview unavailable — please download the file.'}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1.5 mb-4">
                    This attachment ({previewState.mimeType}) cannot be displayed inline. You can
                    download the original file using the button below.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-700 text-white hover:bg-red-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </button>
                </div>
              ) : previewState.mimeType.startsWith('image/') ? (
                <div className="overflow-auto max-w-full max-h-[72vh] flex items-center justify-center p-2">
                  <img
                    src={previewState.blobUrl}
                    alt={previewState.fileName}
                    onError={() =>
                      setPreviewRenderError(
                        'Unable to render image preview. Please download the file.'
                      )
                    }
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                    className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-sm bg-white transition-transform"
                  />
                </div>
              ) : previewState.mimeType === 'application/pdf' && previewState.pdfBytes ? (
                <PdfDocumentRenderer
                  pdfBytes={previewState.pdfBytes}
                  zoom={zoom}
                  onRenderError={(msg) => setPreviewRenderError(msg)}
                />
              ) : (
                <div className="text-center p-8 bg-white rounded-xl border border-neutral-200 max-w-md shadow-xs">
                  <FileText className="w-10 h-10 text-neutral-500 mx-auto mb-2.5" />
                  <p className="text-sm font-semibold text-neutral-900">
                    Preview unavailable — please download the file.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-700 text-white hover:bg-red-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
