import { NativeModules } from 'react-native';

export type BBox = { x: number; y: number; w: number; h: number };
export type OcrSpan = { text: string; bbox: BBox };
export type OcrResult = { pageIndex: number; spans: OcrSpan[] };

export interface ScanModuleType {
  scan(): Promise<{ pages: string[] }>;
  ocr(pages: string[]): Promise<OcrResult[]>;
  makeSearchablePdf(
    pages: string[],
    ocr: OcrResult[],
  ): Promise<{ pdfUri: string }>;
}

const { ScanModule } = NativeModules as { ScanModule: ScanModuleType };
export default ScanModule;

