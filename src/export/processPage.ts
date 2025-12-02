import { Image, NativeModules } from 'react-native';
import ImageResizer from 'react-native-image-resizer';

import type { Doc, Page } from '../types';
import { getExportProfile } from './quality';
import { log } from '../utils/log';
import { putPageFile } from '../storage';

const { ImageFilters } = NativeModules as any;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      error => reject(error),
    );
  });
}

/**
 * Applies final filter and resize to a page image.
 * This creates a single processed image that will be used for both OCR and PDF export.
 * Only processes image-based docs (not imported PDFs with originalPdfPath).
 */
export async function applyFinalFilterToPage(
  page: Page,
  doc: Doc,
  pageIndex: number,
): Promise<Page> {
  // Skip processing for imported PDFs - they use originalPdfPath for export
  if (doc.originalPdfPath) {
    log('[Export] Skipping processing for imported PDF page');
    return page;
  }

  // If already processed, return as-is
  if (page.processedUri) {
    log('[Export] Page already processed:', page.processedUri);
    return page;
  }

  const profile = getExportProfile(doc.exportQuality ?? 'color-medium');

  try {
    // 1) Apply filter / rotation / auto-contrast once
    let filteredUri: string;
    if (ImageFilters?.process) {
      filteredUri = await ImageFilters.process(page.uri, {
        filter: page.filter ?? 'color',
        rotation: page.rotation ?? 0,
        autoContrast: page.autoContrast ?? false,
      });
    } else {
      log('[Export] ImageFilters not available, using original URI');
      filteredUri = page.uri;
    }

    // 2) Resize + JPEG encode once (final image used for everything)
    const resized = await ImageResizer.createResizedImage(
      filteredUri,
      profile.maxWidth,
      profile.maxHeight,
      'JPEG',
      profile.jpegQuality * 100,
      0, // rotation (already applied above)
      undefined, // outputPath
      false, // keepMeta
    );

    const finalUri = resized.uri ?? resized.path;
    const finalSize = await getImageSize(finalUri);

    // Save the processed image to doc storage
    const storedUri = await putPageFile(doc.id, finalUri, pageIndex);
    const storedSize = await getImageSize(storedUri);

    log('[Export] processed page', {
      pageId: page.id,
      quality: doc.exportQuality ?? 'color-medium',
      width: storedSize.width,
      height: storedSize.height,
      jpegQuality: profile.jpegQuality,
    });

    return {
      ...page,
      processedUri: storedUri,
      width: storedSize.width,
      height: storedSize.height,
    };
  } catch (error) {
    log('[Export] Failed to process page, using original:', error);
    return page;
  }
}

