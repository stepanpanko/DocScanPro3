// src/ocr/events.ts
// Simple event emitter for OCR progress tracking

export type OcrProgressEvent = {
  documentId: string;
  processed: number;
  total: number;
};

export type OcrCompleteEvent = {
  documentId: string;
  success: boolean;
  error?: string;
};

type EventCallback<T> = (data: T) => void;

class OcrEventEmitter {
  private progressListeners: EventCallback<OcrProgressEvent>[] = [];
  private completeListeners: EventCallback<OcrCompleteEvent>[] = [];

  onProgress(callback: EventCallback<OcrProgressEvent>): () => void {
    this.progressListeners.push(callback);
    // Return unsubscribe function
    return () => {
      const index = this.progressListeners.indexOf(callback);
      if (index > -1) {
        this.progressListeners.splice(index, 1);
      }
    };
  }

  onComplete(callback: EventCallback<OcrCompleteEvent>): () => void {
    this.completeListeners.push(callback);
    // Return unsubscribe function
    return () => {
      const index = this.completeListeners.indexOf(callback);
      if (index > -1) {
        this.completeListeners.splice(index, 1);
      }
    };
  }

  emitProgress(data: OcrProgressEvent): void {
    this.progressListeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.warn('[OCR Events] Progress callback error:', error);
      }
    });
  }

  emitComplete(data: OcrCompleteEvent): void {
    this.completeListeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.warn('[OCR Events] Complete callback error:', error);
      }
    });
  }

  removeAllListeners(): void {
    this.progressListeners.length = 0;
    this.completeListeners.length = 0;
  }
}

// Singleton instance
export const ocrEvents = new OcrEventEmitter();

