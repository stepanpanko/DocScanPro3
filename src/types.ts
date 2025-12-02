export type Rotation = 0 | 90 | 180 | 270;
export type Filter = 'color' | 'grayscale' | 'bw';
export type ExportQuality = 'color-high' | 'color-medium' | 'grayscale';

export type OcrWord = {
  text: string;
  box: { x: number; y: number; width: number; height: number }; // in image pixels
  conf?: number;
  imgW: number;
  imgH: number;
};

export type OcrPage = {
  fullText: string; // page text joined by spaces/newlines
  words: OcrWord[]; // bounding boxes per word (or line if that's what the lib returns)
  imgW: number;
  imgH: number;
};

export type OcrStatus = 'idle' | 'running' | 'done' | 'error';

export interface OcrProgress {
  processed: number;
  total: number;
}

export type Page = {
  id: string;
  uri: string;
  rotation?: Rotation;
  filter: Filter;
  autoContrast?: boolean;
  width?: number;
  height?: number;
  ocrText?: string; // page.fullText from OCR
  ocrBoxes?: OcrWord[]; // page.words from OCR
  processedUri?: string; // final processed image URI (filtered + resized) for OCR and export
};

export interface Doc {
  id: string;
  title: string;
  createdAt: number;
  pages: Page[];
  folderId?: string | null;
  ocr: string[]; // kept for backward compatibility
  ocrStatus?: OcrStatus;
  ocrProgress?: OcrProgress;
  ocrExcerpt?: string; // first ~200 chars across pages
  ocrPages?: OcrPage[];
  pdfPath?: string;
  originalPdfPath?: string; // absolute path to the imported PDF file for this doc, if any
  exportQuality?: ExportQuality; // quality profile for image-based exports
}

export type Folder = {
  id: string;
  name: string;
  createdAt: number;
};

export type RootStackParamList = {
  Library: undefined;
  EditDocument: { docId: string; startIndex?: number; title?: string };
};

import { defaultDocTitle } from './utils/naming';

export const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export function newDoc(title: string = defaultDocTitle()): Doc {
  return {
    id: String(Date.now()),
    title,
    createdAt: Date.now(),
    pages: [],
    folderId: null,
    ocr: [],
  };
}

export function newPage(uri: string, width: number, height: number): Page {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    uri,
    rotation: 0,
    filter: 'color',
    width,
    height,
  };
}

