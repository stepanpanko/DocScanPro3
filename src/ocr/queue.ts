// src/ocr/queue.ts
import { getDocsIndex, saveDocsIndex } from '../storage';
import type { Doc, OcrStatus } from '../types';
import { log, warn, error } from '../utils/log';

import { ocrEvents } from './events';
import { recognizePage } from './provider';

// Global queue state (legacy - now handled by singleton class)
// These are kept for backward compatibility but not used in the new implementation

/**
 * Update document OCR status and progress in storage
 */
function updateDocumentOcrState(
  documentId: string,
  updates: Partial<
    Pick<Doc, 'ocrStatus' | 'ocrProgress' | 'ocrExcerpt' | 'pages'>
  >,
): void {
  const docs = getDocsIndex();
  const docIndex = docs.findIndex(d => d.id === documentId);

  if (docIndex === -1) {
    warn('[OCR] Document not found:', documentId);
    return;
  }

  const current = docs[docIndex];
  const updatedDoc = { ...current, ...updates } as Doc;
  docs[docIndex] = updatedDoc;
  saveDocsIndex(docs);

  log('[OCR] Updated document state:', documentId, updates);
}

/**
 * Create an excerpt from OCR text (first ~200 chars)
 */
function createOcrExcerpt(pages: Doc['pages']): string {
  const allText = pages
    .map(p => p.ocrText || '')
    .join(' ')
    .trim();

  if (allText.length <= 200) return allText;

  // Find a good break point near 200 chars
  const cutoff = allText.substring(0, 200);
  const lastSpace = cutoff.lastIndexOf(' ');

  return lastSpace > 150 ? cutoff.substring(0, lastSpace) + '…' : cutoff + '…';
}

/**
 * Singleton OCR Queue Class
 */
class OcrQueue {
  private isProcessing = false;
  private currentDocumentId: string | null = null;
  private processingQueue: string[] = [];

  /**
   * Auto-enqueue a document for OCR processing (no-op if already running/queued/done)
   */
  enqueueDoc(documentId: string): void {
    console.log('[OCR][auto] enqueue', { docId: documentId });
    log('[OCR] Auto-enqueuing document:', documentId);

    // Check if document already has OCR data
    const docs = getDocsIndex();
    const doc = docs.find(d => d.id === documentId);

    if (!doc) {
      warn('[OCR] Document not found for auto-enqueue:', documentId);
      return;
    }

    // Skip if already done or running
    if (doc.ocrStatus === 'done') {
      console.log('[OCR][auto] skip - already done', { docId: documentId });
      log('[OCR] Document already has OCR data, skipping:', documentId);
      return;
    }

    if (doc.ocrStatus === 'running') {
      console.log('[OCR][auto] skip - already running', { docId: documentId });
      log('[OCR] Document OCR already running, skipping:', documentId);
      return;
    }

    // Add to queue if not already queued
    if (
      !this.processingQueue.includes(documentId) &&
      this.currentDocumentId !== documentId
    ) {
      this.processingQueue.push(documentId);
      log('[OCR] Added document to processing queue:', documentId);
    }

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processNext();
    }
  }

  /**
   * Cancel OCR for a specific document
   */
  cancel(documentId: string): void {
    console.log('[OCR][auto] cancel', { docId: documentId });
    log('[OCR] Cancelling OCR for:', documentId);

    // Remove from queue
    this.processingQueue = this.processingQueue.filter(id => id !== documentId);

    // If this is the currently processing document, stop it
    if (this.currentDocumentId === documentId) {
      // Update status to idle
      updateDocumentOcrState(documentId, {
        ocrStatus: 'idle',
      });

      // Reset processing state
      this.isProcessing = false;
      this.currentDocumentId = null;

      // Process next in queue if any
      this.processNext();
    }
  }

  /**
   * Process the next document in the queue
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    const documentId = this.processingQueue.shift()!;
    this.isProcessing = true;
    this.currentDocumentId = documentId;

    console.log('[OCR][auto] start', { docId: documentId });
    log('[OCR] Starting auto OCR processing for:', documentId);

    try {
      await this.processDocument(documentId);
    } catch (processingError) {
      console.log('[OCR][auto] error', {
        docId: documentId,
        error: String(processingError),
      });
      error('[OCR] Auto OCR processing failed:', processingError);

      // Update status to error
      updateDocumentOcrState(documentId, {
        ocrStatus: 'error',
      });

      ocrEvents.emitComplete({
        documentId,
        success: false,
        error: String(processingError),
      });
    } finally {
      // Reset processing state
      this.isProcessing = false;
      this.currentDocumentId = null;

      // Process next in queue if any
      if (this.processingQueue.length > 0) {
        setTimeout(() => this.processNext(), 100); // Small delay to prevent stack overflow
      }
    }
  }

  /**
   * Process a single document through OCR (internal method)
   */
  private async processDocument(documentId: string): Promise<void> {
    const docs = getDocsIndex();
    const doc = docs.find(d => d.id === documentId);

    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    if (!doc.pages || doc.pages.length === 0) {
      throw new Error(`Document has no pages: ${documentId}`);
    }

    const total = doc.pages.length;
    console.log('[OCR][auto] start', { docId: documentId, totalPages: total });

    // Initialize progress
    let processed = 0;

    updateDocumentOcrState(documentId, {
      ocrStatus: 'running',
      ocrProgress: { processed, total },
    });

    ocrEvents.emitProgress({ documentId, processed, total });

    // Process pages sequentially
    const updatedPages = [...doc.pages];

    for (let i = 0; i < doc.pages.length; i++) {
      // Check if cancelled
      if (this.currentDocumentId !== documentId) {
        log('[OCR] Processing cancelled for:', documentId);
        return;
      }

      const page = doc.pages[i];
      if (!page) continue;

      try {
        log(`[OCR] Processing page ${i + 1}/${total}:`, page.uri);

        const ocrResult = await recognizePage(page.uri);

        // Update page with OCR data
        updatedPages[i] = {
          ...page,
          ocrText: ocrResult.fullText,
          ocrBoxes: ocrResult.words,
        };

        processed++;

        // Update progress
        updateDocumentOcrState(documentId, {
          ocrProgress: { processed, total },
          pages: updatedPages,
        });

        console.log('[OCR][auto] progress', {
          docId: documentId,
          processed,
          total,
        });
        ocrEvents.emitProgress({ documentId, processed, total });

        log(
          `[OCR] Completed page ${i + 1}/${total}, found ${ocrResult.fullText.length} chars`,
        );
      } catch (pageError) {
        warn(`[OCR] Failed to process page ${i + 1}:`, pageError);

        // Mark page as failed but continue
        updatedPages[i] = {
          ...page,
          ocrText: '',
          ocrBoxes: [],
        };

        processed++;

        // Update progress even for failed pages
        updateDocumentOcrState(documentId, {
          ocrProgress: { processed, total },
          pages: updatedPages,
        });

        console.log('[OCR][auto] progress', {
          docId: documentId,
          processed,
          total,
        });
        ocrEvents.emitProgress({ documentId, processed, total });
      }
    }

    // Create excerpt and finalize
    const ocrExcerpt = createOcrExcerpt(updatedPages);

    // Update backward compatibility OCR field (constructed on final write)

    // Update document with final state
    const finalDocs = getDocsIndex();
    const finalDocIndex = finalDocs.findIndex(d => d.id === documentId);

    if (finalDocIndex !== -1) {
      const base = finalDocs[finalDocIndex];
      finalDocs[finalDocIndex] = {
        ...base,
        ocrStatus: 'done' as OcrStatus,
        ocrProgress: { processed, total },
        ocrExcerpt,
        pages: updatedPages,
        ocr: updatedPages.map(p => p.ocrText ?? '').filter(Boolean),
      } as Doc;
      saveDocsIndex(finalDocs);
    }

    console.log('[OCR][auto] done', { docId: documentId, pages: processed });
    log('[OCR] Document processing completed:', documentId);
    ocrEvents.emitComplete({ documentId, success: true });
  }

  /**
   * Check if OCR is currently running
   */
  isRunning(): boolean {
    return this.isProcessing;
  }

  /**
   * Get current processing document ID
   */
  getCurrentDocument(): string | null {
    return this.currentDocumentId;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    processing: boolean;
    current: string | null;
    queued: string[];
  } {
    return {
      processing: this.isProcessing,
      current: this.currentDocumentId,
      queued: [...this.processingQueue],
    };
  }
}

// Singleton instance
const ocrQueue = new OcrQueue();

// Legacy functions for backward compatibility
export function cancelOcr(): void {
  if (ocrQueue.getCurrentDocument()) {
    ocrQueue.cancel(ocrQueue.getCurrentDocument()!);
  }
}

export function isOcrRunning(): boolean {
  return ocrQueue.isRunning();
}

export function getCurrentOcrDocument(): string | null {
  return ocrQueue.getCurrentDocument();
}

/**
 * Legacy function - now uses the singleton queue
 */
export async function enqueueDocument(documentId: string): Promise<void> {
  ocrQueue.enqueueDoc(documentId);
}

// Export the singleton queue
export { ocrQueue };

