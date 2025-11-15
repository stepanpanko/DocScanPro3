import { Platform, NativeModules } from 'react-native';
import DocumentPicker, {
  types,
  isCancel,
  DocumentPickerResponse,
} from 'react-native-document-picker';
import { launchImageLibrary, MediaType } from 'react-native-image-picker';
import RNFS from 'react-native-fs';

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

/**
 * Gets a readable URI from DocumentPicker response.
 * If fileCopyUri is not available, manually copies the file to cache directory.
 */
async function getUriFromPicker(res: DocumentPickerResponse): Promise<string | null> {
  // Always prefer the copied URI (safe, accessible)
  if (res.fileCopyUri) {
    console.log('[getUriFromPicker] Using fileCopyUri:', res.fileCopyUri);
    return res.fileCopyUri;
  }

  // Fallback: if fileCopyUri is not available, manually copy the file
  if (res.uri) {
    console.warn('[getUriFromPicker] fileCopyUri not available, manually copying from:', res.uri);
    
    try {
      // Extract file extension from name or URI
      const fileName = res.name || 'file';
      const ext = fileName.split('.').pop() || 'tmp';
      const destPath = `${RNFS.CachesDirectoryPath}/${Date.now()}-${fileName}`;
      
      // Copy file to cache directory
      const sourcePath = res.uri.startsWith('file://') 
        ? res.uri.replace('file://', '') 
        : res.uri;
      
      console.log('[getUriFromPicker] Copying from', sourcePath, 'to', destPath);
      
      // Check if source exists
      const sourceExists = await RNFS.exists(sourcePath);
      if (!sourceExists) {
        console.error('[getUriFromPicker] Source file does not exist:', sourcePath);
        return null;
      }
      
      await RNFS.copyFile(sourcePath, destPath);
      const copiedUri = `file://${destPath}`;
      console.log('[getUriFromPicker] Successfully copied to:', copiedUri);
      return copiedUri;
    } catch (error: any) {
      console.error('[getUriFromPicker] Failed to copy file:', error);
      log('[getUriFromPicker] Failed to copy file', res.uri, error);
      return null;
    }
  }

  console.error('[getUriFromPicker] No URI available in response');
  return null;
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
      const uri = await getUriFromPicker(res);
      if (!uri) {
        console.warn('[IMPORT] Skipping file - no readable URI available');
        continue;
      }

      const fileName = res.name || `file-${pages.length}`;
      const fileType = res.type || '';

      console.log('[FILES PICK]', {
        uri,
        fileCopyUri: res.fileCopyUri,
        sourceUri: res.uri,
        name: fileName,
        type: fileType,
      });

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
          // PDF rasterizer needs a file path, so convert URI to path
          const path = uri.startsWith('file://') ? uri.replace('file://', '') : uri;
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
          console.log('[IMPORT] Calling putPageFile with uri:', uri);
          const pageUri = await putPageFile(doc.id, uri, pages.length);
          console.log('[IMPORT] putPageFile returned:', pageUri);
          const dimensions = await getImageDimensions(pageUri);
          pages.push(newPage(pageUri, dimensions.width, dimensions.height));
          console.log('[IMPORT] Successfully added page:', pages.length);
        } catch (error: any) {
          console.error('[IMPORT] Image processing failed:', error);
          console.error('[IMPORT] Error details:', {
            message: error?.message,
            stack: error?.stack,
            uri,
            fileCopyUri: res.fileCopyUri,
            sourceUri: res.uri,
          });
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

