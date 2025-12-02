// src/pdf.ts
import { NativeModules } from 'react-native';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';

import type { Doc, Page } from './types';
import { log, warn } from './utils/log';
import { buildPdfNative } from './native/nativePDFBuilder';
import { sanitizeFilename } from './utils/filename';

/**
 * Checks if a document has visual edits that require rebuilding from images.
 * If the document came from an imported PDF and has no visual edits, we can
 * return the original PDF to preserve vector quality.
 */
function hasVisualEdits(doc: Doc): boolean {
  if (!doc.pages?.length) return false;

  return doc.pages.some((p: Page) => {
    // If user has rotated the page (non-zero rotation)
    const rotated = !!p.rotation && p.rotation !== 0;

    // If user has applied a non-default filter (not 'color')
    const customFilter = p.filter && p.filter !== 'color';

    // If user has enabled auto-contrast
    const hasAutoContrast = p.autoContrast === true;

    // If URI was changed (indicates cropping or other image manipulation)
    // For imported PDFs, the URI will point to a rasterized image, but if
    // it was cropped, the URI would have changed from the original raster.
    // We can't easily detect this without tracking original URIs, so we'll
    // be conservative: if any page has been edited, we rebuild.
    // Note: This is a simple check. A more sophisticated approach would
    // track original URIs, but for now this covers the main cases.

    return rotated || customFilter || hasAutoContrast;
  });
}

async function getProcessedUriForExport(page: Page): Promise<string> {
  // If page already has processedUri (from applyFinalFilterToPage), use it
  // This ensures we use the same processed image for OCR and export
  if (page.processedUri) {
    log('[PDF] Using pre-processed image:', page.processedUri);
    return page.processedUri;
  }

  // Fallback: process on-the-fly (for backward compatibility or imported PDFs)
  // Check if ImageFilters module is available
  if (!NativeModules.ImageFilters) {
    log('[PDF] ImageFilters module not available, using original image');
    return page.uri;
  }

  try {
    const result = await NativeModules.ImageFilters.process(page.uri, {
      filter: page.filter ?? 'color',
      rotation: page.rotation ?? 0,
      autoContrast: page.autoContrast ?? false,
    });
    return result;
  } catch (error) {
    log('[PDF] Native processing failed, using original:', error);
    return page.uri;
  }
}

export async function buildPdfFromImages(docId: string, doc: Doc) {
  // If this doc came from an imported PDF and we haven't done visual edits
  // that require rebuilding the pages, we simply return the original PDF.
  if (doc.originalPdfPath && !hasVisualEdits(doc)) {
    const path = doc.originalPdfPath;
    
    // Verify the file actually exists before using it
    const exists = await RNFS.exists(path);
    if (exists) {
      const uri = `file://${path}`;
      log('[PDF] returning original imported PDF:', { uri, path });
      return uri;
    } else {
      warn('[PDF] originalPdfPath missing, falling back to image export', {
        path,
        docId,
        title: doc.title,
      });
    }
  }

  // Fallback: build via native image-based pipeline (camera scans, edited docs, etc.)
  log('[PDF] building via native image pipeline, pages:', doc.pages.length);

  // Process images with filters/rotation before passing to native builder
  const processedPages = await Promise.all(
    doc.pages.map(async page => ({
      ...page,
      uri: await getProcessedUriForExport(page),
    })),
  );

  const docWithProcessedPages = {
    ...doc,
    pages: processedPages,
  };

  const pdfUri = await buildPdfNative(docWithProcessedPages);

  log('[PDF] native wrote:', pdfUri);
  return pdfUri;
}

/**
 * Copies a PDF file to a temporary location with the specified filename.
 * This ensures the shared file has the correct name.
 * Overwrites existing file if it exists.
 */
async function copyPdfWithName(
  sourceUri: string,
  filename: string,
): Promise<string> {
  const tempDir = RNFS.TemporaryDirectoryPath;
  const targetPath = `${tempDir}/${filename}`;

  try {
    // Remove file:// scheme if present
    const sourcePath = sourceUri.startsWith('file://')
      ? sourceUri.replace('file://', '')
      : sourceUri;

    // Ensure source exists
    if (!(await RNFS.exists(sourcePath))) {
      throw new Error(`Source file does not exist: ${sourcePath}`);
    }

    // Remove existing file in temp if it exists (to overwrite)
    if (await RNFS.exists(targetPath)) {
      log('[PDF] Removing existing temp file:', targetPath);
      await RNFS.unlink(targetPath);
    }

    // Copy to temp location with correct name
    await RNFS.copyFile(sourcePath, targetPath);
    
    // Verify the copy succeeded
    if (!(await RNFS.exists(targetPath))) {
      throw new Error(`Failed to verify copied file exists: ${targetPath}`);
    }

    const targetUri = `file://${targetPath}`;
    log('[PDF] Successfully copied PDF to:', targetUri, 'with filename:', filename);
    
    // Log file size for debugging
    try {
      const stat = await RNFS.stat(targetPath);
      log('[PDF] Copied file size:', Math.round(stat.size / 1024), 'KB');
    } catch (e) {
      // Ignore stat errors
    }

    return targetUri;
  } catch (error) {
    log('[PDF] Failed to copy PDF with name:', error);
    log('[PDF] Source URI:', sourceUri);
    log('[PDF] Target path:', targetPath);
    // Fallback to original URI if copy fails
    return sourceUri;
  }
}

export async function shareFile(fileUri: string, doc?: Doc) {
  // Get the document title - use doc.title if available, otherwise fallback
  const baseName = doc?.title || 'Scan';
  const safeName = sanitizeFilename(baseName) || 'Scan';
  const filename = `${safeName}.pdf`;

  log('[share] Document title:', doc?.title);
  log('[share] Base name:', baseName);
  log('[share] Safe name:', safeName);
  log('[share] Final filename:', filename);
  log('[share] Source URI:', fileUri);

  // Copy the PDF to a temp location with the correct filename
  // This ensures iOS respects the filename when sharing
  const renamedUri = await copyPdfWithName(fileUri, filename);

  log('[share] Renamed URI:', renamedUri);
  log('[share] Opening share dialog with filename:', filename);
  
  await Share.open({
    url: renamedUri,
    type: 'application/pdf',
    filename: filename,
    failOnCancel: false,
  });
}

