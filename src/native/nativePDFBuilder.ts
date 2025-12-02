import { NativeModules } from 'react-native';

import type { OcrWord, Doc } from '../types';

const { NativePDFBuilder } = NativeModules as {
  NativePDFBuilder?: {
    build(pages: {
      imagePath: string;
      imgW: number;
      imgH: number;
      ocrWords: OcrWord[];
    }[]): Promise<string>;
  };
};

export async function buildPdfNative(doc: Doc): Promise<string> {
  if (!NativePDFBuilder) {
    throw new Error('NativePDFBuilder module not available');
  }

  if (!doc.pages?.length) {
    throw new Error('Document has no pages');
  }

  const pagesPayload = doc.pages.map(page => {
    if (!page.uri) {
      throw new Error('Page missing uri');
    }

    const ocrWords = (page.ocrBoxes ?? []) as OcrWord[];

    // Find image dimensions from first word with imgW/imgH, fallback to page metadata if present.
    // Convert to integers as Swift expects Int type
    const firstWord = ocrWords[0] as any;
    const imgW = Math.round(firstWord?.imgW ?? page.width ?? 0);
    const imgH = Math.round(firstWord?.imgH ?? page.height ?? 0);

    // Transform OCR words from { box: { x, y, width, height } } to { x, y, width, height }
    // Convert to integers as Swift expects Int type
    const transformedOcrWords = ocrWords.map(word => ({
      text: word.text,
      x: Math.round(word.box.x),
      y: Math.round(word.box.y),
      width: Math.round(word.box.width),
      height: Math.round(word.box.height),
      conf: word.conf,
    }));

    return {
      imagePath: page.uri.replace('file://', ''), // strip scheme for native
      imgW,
      imgH,
      ocrWords: transformedOcrWords,
    };
  });

  const pdfPath = await NativePDFBuilder.build(pagesPayload);
  return `file://${pdfPath}`;
}

