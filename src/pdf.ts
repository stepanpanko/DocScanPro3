// src/pdf.ts
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import ImageResizer from 'react-native-image-resizer';
import Share from 'react-native-share';

import type { OcrWord, Doc } from './types';
import { log, warn } from './utils/log';
import { stripFileScheme } from './utils/paths';

const dataUri = (b64: string, kind: 'jpg' | 'png') =>
  `data:image/${kind === 'jpg' ? 'jpeg' : 'png'};base64,${b64}`;

async function readBase64(pathOrUri: string) {
  return RNFS.readFile(stripFileScheme(pathOrUri), 'base64');
}

async function getProcessedUriForExport(page: any): Promise<string> {
  try {
    const result = await NativeModules.ImageFilters.process(page.uri, {
      filter: page.filter ?? 'color',
      rotation: page.rotation ?? 0,
      autoContrast: page.autoContrast ?? false,
    });
    return result;
  } catch (error) {
    console.warn('[PDF] Native processing failed, using original:', error);
    return page.uri;
  }
}

/**
 * Convert image pixel coordinates to PDF points within the actual image draw rectangle
 * Image coordinates: origin top-left, in pixels
 * PDF coordinates: origin bottom-left, in points
 */
function imageRectToPdfRect(
  box: { x: number; y: number; width: number; height: number },
  ocrImageW: number,
  ocrImageH: number,
  drawRect: { x: number; y: number; width: number; height: number },
): { x: number; y: number; size: number; baselineAdjust: number } {
  // Scale from OCR image coordinates to the actual image draw area
  const scaleX = drawRect.width / ocrImageW;
  const scaleY = drawRect.height / ocrImageH;

  // Transform coordinates:
  // OCR: origin top-left, PDF: origin bottom-left
  // Map to the actual draw rectangle position
  const x = drawRect.x + box.x * scaleX;
  const y = drawRect.y + (drawRect.height - (box.y + box.height) * scaleY); // flip Y and align baseline at bottom of box
  const size = Math.max(box.height * scaleY * 0.9, 6); // font size ~90% of box height, minimum 6 points
  // Baseline correction (~20% of font size)
  const baselineAdjust = size * 0.2;

  log(
    `[PDF] Coord transform: OCR(${box.x},${box.y}) ${ocrImageW}x${ocrImageH} -> PDF(${x},${y}) in drawRect(${drawRect.x},${drawRect.y},${drawRect.width}x${drawRect.height}) scale(${scaleX},${scaleY})`,
  );

  return { x, y, size, baselineAdjust };
}

/**
 * Draw invisible OCR text overlay on a PDF page
 */
async function drawInvisibleTextLayer(
  page: any, // PDFPage
  font: any, // PDFFont
  ocrWords: OcrWord[],
  imageSize: { width: number; height: number },
  drawRect: { x: number; y: number; width: number; height: number },
): Promise<void> {
  if (!ocrWords || ocrWords.length === 0) {
    log('[PDF] No OCR data for text overlay');
    return;
  }

  log(`[PDF] overlay words: ${ocrWords.length}`);

  for (const word of ocrWords) {
    if (!word.text.trim()) continue; // Skip empty text

    try {
      const { x, y, size, baselineAdjust } = imageRectToPdfRect(
        word.box,
        imageSize.width,
        imageSize.height,
        drawRect,
      );

      // Draw text with very low opacity to make it invisible but searchable
      page.drawText(word.text, {
        x,
        y: y + baselineAdjust, // Apply baseline correction
        size,
        font,
        opacity: 0.001, // Nearly invisible but not exactly 0
      });
    } catch (textError) {
      warn('[PDF] Failed to draw OCR text:', word.text, textError);
      // Continue with other words even if one fails
    }
  }
}

export async function buildPdfFromImages(docId: string, doc: Doc) {
  const dir = `${RNFS.DocumentDirectoryPath}/DocScanPro/${docId}`;
  await RNFS.mkdir(dir);
  const pdfPath = `${dir}/export.pdf`;

  log('[PDF] start, pages:', doc.pages.length);

  // Only add invisible text layer if we have REAL bounding boxes from VisionOCR
  // (empty ocrBoxes array means TextRecognition fallback was used - no accurate boxes)
  const hasOcrData =
    doc.ocrStatus === 'done' &&
    doc.pages?.some(p => p.ocrBoxes && p.ocrBoxes.length > 0);

  if (hasOcrData) {
    log(
      '[PDF] Document has OCR data with bounding boxes, will add invisible text layer',
    );
  } else if (doc.ocrStatus === 'done') {
    log(
      '[PDF] Document has OCR text but no bounding boxes (TextRecognition fallback), skipping overlay',
    );
  } else {
    log('[PDF] No OCR data found, creating image-only PDF');
  }

  const pdf = await PDFDocument.create();

  // Embed font for text overlay (only if we have OCR data)
  let font;
  if (hasOcrData) {
    try {
      font = await pdf.embedFont(StandardFonts.Helvetica);
      log('[PDF] Embedded Helvetica font for text overlay');
    } catch (fontError) {
      warn('[PDF] Failed to embed font, skipping text overlay:', fontError);
    }
  }

  for (let i = 0; i < doc.pages.length; i++) {
    const docPage = doc.pages[i];
    if (!docPage) continue;
    const src = await getProcessedUriForExport(docPage);
    log(`[PDF] page ${i + 1}:`, src);

    // 1) Optimize image first to ensure consistent file sizes
    // Resize to max 2000px and compress to 82% quality for optimal size/quality balance
    let optimizedSrc = src;
    try {
      const r = await ImageResizer.createResizedImage(
        src,
        2000,
        2000,
        'JPEG',
        82,
        0,
        undefined,
        false,
      );
      const optimizedPath =
        (r as { path?: string; uri?: string }).path ||
        (r as { path?: string; uri?: string }).uri;
      if (optimizedPath) {
        optimizedSrc = optimizedPath;
        log('[PDF] image optimized for export');
      }
    } catch (optimizeError) {
      warn('[PDF] image optimization failed, using original:', optimizeError);
    }

    // 2) Read the optimized file
    let b64 = await readBase64(optimizedSrc);

    // 3) Try to embed as JPG (should always work after optimization)
    let img: Awaited<ReturnType<typeof pdf.embedJpg>>;

    try {
      img = await pdf.embedJpg(dataUri(b64, 'jpg'));
      log('[PDF] embedded as JPG');
    } catch {
      // Fallback: try PNG if JPEG fails (shouldn't happen after optimization)
      try {
        img = await pdf.embedPng(dataUri(b64, 'png'));
        log('[PDF] embedded as PNG (fallback)');
      } catch {
        throw new Error('Failed to embed image in PDF');
      }
    }

    const pdfPage = pdf.addPage([img.width, img.height]);
    const drawRect = { x: 0, y: 0, width: img.width, height: img.height };
    pdfPage.drawImage(img, drawRect);

    // 3) Add invisible text layer if we have OCR data for this page
    if (hasOcrData && font && docPage.ocrBoxes?.length) {
      try {
        const ocrBoxes = docPage.ocrBoxes!; // We know it exists and has length > 0

        // Use the original image size from OCR data - this is critical for correct coordinate mapping
        const firstWord = ocrBoxes[0];
        if (!firstWord || !firstWord.imgW || !firstWord.imgH) {
          warn(
            `[PDF] OCR data missing image dimensions for page ${i + 1}, skipping text overlay`,
          );
          continue;
        }

        const ocrImageSize = { width: firstWord.imgW, height: firstWord.imgH };

        await drawInvisibleTextLayer(
          pdfPage,
          font,
          ocrBoxes,
          ocrImageSize,
          drawRect,
        );

        log(
          `[PDF] Added invisible text layer to page ${i + 1} (OCR: ${ocrImageSize.width}x${ocrImageSize.height} -> PDF drawRect: ${drawRect.width}x${drawRect.height})`,
        );
      } catch (overlayError) {
        warn(
          `[PDF] Failed to add text overlay to page ${i + 1}:`,
          overlayError,
        );
        // Continue without overlay for this page
      }
    }
  }

  // 4) Save the PDF
  const pdfB64 = await pdf.saveAsBase64({ dataUri: false });
  await RNFS.writeFile(pdfPath, pdfB64, 'base64');
  const finalUri = `file://${pdfPath}`;
  log('[pdf] wrote:', finalUri);

  return finalUri;
}

export async function shareFile(fileUri: string) {
  log('[share] opening:', fileUri);
  await Share.open({
    url: fileUri,
    type: 'application/pdf',
    filename: 'DocScanPro.pdf',
    failOnCancel: false,
  });
}

