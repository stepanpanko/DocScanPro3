import { Platform, NativeModules } from 'react-native';
import DocumentPicker, {
  types,
  isCancel,
  DocumentPickerResponse,
} from 'react-native-document-picker';
import { launchImageLibrary, MediaType } from 'react-native-image-picker';

import { putPageFile } from '../storage';
import { newDoc, newPage, type Doc, type Page } from '../types';
import { getImageDimensions } from '../utils/images';
import { log } from '../utils/log';
import { defaultDocTitle } from '../utils/naming';

const { PDFRasterizer } = NativeModules as {
  PDFRasterizer?: {
    rasterize: (path: string, dpi: number) => Promise<string[]>;
  };
};

function localPathFromPicker(res: DocumentPickerResponse) {
  // Always prefer the copied URI (safe, accessible)
  const uri = res.fileCopyUri ?? res.uri;
  if (!uri) return null;
  // Normalize file:// on iOS
  return decodeURI(uri.replace('file://', ''));
}

export async function importFromFiles(): Promise<Doc | null> {
  try {
    console.log('[IMPORT] Starting file import...');

    const results = await DocumentPicker.pick({
      presentationStyle: 'fullScreen',
      allowMultiSelection: true,
      copyTo: Platform.OS === 'ios' ? 'cachesDirectory' : 'documentDirectory',
      type: [types.images, types.pdf],
    });

    console.log('[IMPORT] files picked:', results.length, 'items');

    if (results.length === 0) {
      return null;
    }

    const now = new Date();
    const doc = newDoc(defaultDocTitle(now.getTime()));
    const pages: Page[] = [];

    // Process each selected file
    for (const res of results) {
      const path = localPathFromPicker(res);
      if (!path) continue;

      const fileName = res.name || `file-${pages.length}`;
      const fileType = res.type || '';

      console.log('[IMPORT] Processing file:', fileName, 'type:', fileType);

      const isPDF =
        (fileType?.includes('pdf') ?? false) ||
        fileName.toLowerCase().endsWith('.pdf');

      if (isPDF) {
        // Handle PDF files
        console.log('[IMPORT] Processing PDF:', fileName);

        if (!PDFRasterizer?.rasterize) {
          console.warn('[IMPORT] PDFRasterizer native module not available.');
          // TODO: show toast "Rebuild the app; PDF import needs native module."
          continue;
        }

        try {
          const pagePaths = await PDFRasterizer.rasterize(path, 250);
          console.log(
            '[IMPORT] pdf rasterized:',
            pagePaths.length,
            'pages @250dpi',
          );

          // Add each rasterized page
          for (const pagePath of pagePaths) {
            const pageUri = await putPageFile(doc.id, pagePath, pages.length);
            const dimensions = await getImageDimensions(pageUri);
            pages.push(newPage(pageUri, dimensions.width, dimensions.height));
          }
        } catch (error) {
          console.error('[IMPORT] PDF rasterization failed:', error);
          log('[IMPORT] PDF rasterization failed for', fileName, error);
        }
      } else {
        // Handle image files
        console.log('[IMPORT] Processing image:', fileName);

        try {
          const pageUri = await putPageFile(doc.id, path, pages.length);
          const dimensions = await getImageDimensions(pageUri);
          pages.push(newPage(pageUri, dimensions.width, dimensions.height));
        } catch (error) {
          console.error('[IMPORT] Image processing failed:', error);
          log('[IMPORT] Image processing failed for', fileName, error);
        }
      }
    }

    if (pages.length === 0) {
      console.log('[IMPORT] No pages were successfully processed');
      return null;
    }

    // Update document with pages
    doc.pages = pages;

    console.log('[IMPORT] created doc=', doc.id, 'pages=', pages.length);

    return doc;
  } catch (err: any) {
    if (isCancel(err)) {
      console.log('[IMPORT] picker cancelled');
      return null; // Do not show error UI
    }
    console.error('[IMPORT] File import failed:', err);
    log('[IMPORT] File import failed:', err);
    return null;
  }
}

export async function importFromPhotos(): Promise<Doc | null> {
  try {
    console.log('[IMPORT] Starting photos import...');

    const result = await launchImageLibrary({
      mediaType: 'photo' as MediaType,
      selectionLimit: 20,
      includeExtra: true,
      quality: 0.8,
    });

    if (result.didCancel || !result.assets || result.assets.length === 0) {
      console.log('[IMPORT] Photos selection cancelled or empty');
      return null;
    }

    console.log('[IMPORT] photos picked:', result.assets.length, 'images');

    const now = new Date();
    const doc = newDoc(defaultDocTitle(now.getTime()));
    const pages: Page[] = [];

    // Process each selected photo
    const assets = result.assets;
    for (let i = 0; i < (assets?.length ?? 0); i++) {
      const asset = assets?.[i];
      if (!asset?.uri) continue;

      const fileUri = asset.uri;
      const fileName = asset.fileName ?? `photo-${i}`;

      console.log('[IMPORT] Processing photo:', fileName);

      try {
        const pageUri = await putPageFile(doc.id, fileUri, pages.length);
        const dimensions = await getImageDimensions(pageUri);
        pages.push(newPage(pageUri, dimensions.width, dimensions.height));
      } catch (error) {
        console.error('[IMPORT] Photo processing failed:', error);
        log('[IMPORT] Photo processing failed for', fileName, error);
      }
    }

    if (pages.length === 0) {
      console.log('[IMPORT] No photos were successfully processed');
      return null;
    }

    // Update document with pages
    doc.pages = pages;

    console.log('[IMPORT] created doc=', doc.id, 'pages=', pages.length);

    return doc;
  } catch (error) {
    console.error('[IMPORT] Photos import failed:', error);
    log('[IMPORT] Photos import failed:', error);
    return null;
  }
}

