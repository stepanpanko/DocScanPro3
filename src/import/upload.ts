import { Platform, NativeModules } from 'react-native';
import DocumentPicker, {
  types,
  isCancel,
  DocumentPickerResponse,
} from 'react-native-document-picker';
import { launchImageLibrary, MediaType } from 'react-native-image-picker';
import RNFS from 'react-native-fs';

import { putPageFile, putOriginalPdf } from '../storage';
import { newDoc, newPage, type Doc, type Page } from '../types';
import { getImageDimensions } from '../utils/images';
import { log } from '../utils/log';
import {
  defaultDocTitle,
  getNextDefaultDocName,
} from '../utils/naming';
import {
  extractFilenameFromUri,
  stripExtension,
} from '../utils/filename';
import { toReadableFsPath } from '../utils/paths';

const { PDFRasterizer } = NativeModules as {
  PDFRasterizer?: {
    rasterize: (path: string, dpi: number) => Promise<string[]>;
  };
};

/**
 * Gets a readable URI from DocumentPicker response.
 * If fileCopyUri is not available, manually copies the file to cache directory.
 */
/**
 * Cleans a URI by removing query parameters and fragments
 */
function cleanUri(uri: string): string {
  // Remove query parameters and fragments
  return uri.split('?')[0].split('#')[0];
}

async function getUriFromPicker(res: DocumentPickerResponse): Promise<string | null> {
  // Always prefer the copied URI (safe, accessible)
  if (res.fileCopyUri) {
    const cleanedUri = cleanUri(res.fileCopyUri);
    console.log('[getUriFromPicker] Using fileCopyUri:', cleanedUri);
    return cleanedUri;
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
      // Clean the source URI first to remove query params and fragments
      const cleanedSourceUri = cleanUri(res.uri);
      const sourcePath = cleanedSourceUri.startsWith('file://') 
        ? cleanedSourceUri.replace('file://', '') 
        : cleanedSourceUri;
      
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
      return cleanUri(copiedUri);
    } catch (error: any) {
      console.error('[getUriFromPicker] Failed to copy file:', error);
      log('[getUriFromPicker] Failed to copy file', res.uri, error);
      return null;
    }
  }

  console.error('[getUriFromPicker] No URI available in response');
  return null;
}

export async function importFromFiles(): Promise<Doc[]> {
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
      return [];
    }

    const importedDocs: Doc[] = [];

    // Process each selected file - each file becomes its own document
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

      // Create a new document for each file
      const now = new Date();
      const doc = newDoc(defaultDocTitle(now.getTime()));
      const pages: Page[] = [];

      if (isPDF) {
        // Handle PDF files
        console.log('[IMPORT] Processing PDF:', fileName);

        if (!PDFRasterizer?.rasterize) {
          console.warn('[IMPORT] PDFRasterizer native module not available.');
          // TODO: show toast "Rebuild the app; PDF import needs native module."
          continue;
        }

        try {
          // Extract filename from imported PDF first (for title and originalPdfPath)
          const originalFilename = extractFilenameFromUri(uri);
          const baseName = stripExtension(originalFilename);
          
          // Save the original PDF file for later export (preserves vector quality)
          // Pass originalFilename so it can be used for unique naming
          const originalPdfPath = await putOriginalPdf(doc.id, uri, originalFilename);
          doc.originalPdfPath = originalPdfPath;
          console.log('[IMPORT] Saved original PDF to:', originalPdfPath);

          // Use extracted filename as doc title
          if (baseName && baseName !== 'Document') {
            doc.title = baseName;
            console.log('[IMPORT] Set doc title from filename:', baseName);
          }
          
          // Log final document metadata for verification
          log('[IMPORT] PDF stored', {
            title: doc.title,
            originalPdfPath: doc.originalPdfPath,
            originalFilename,
            baseName,
          });

          // PDF rasterizer needs a file path, so convert URI to path properly
          // Use the same path conversion logic as putOriginalPdf
          let pdfPath: string | null = null;
          try {
            pdfPath = await toReadableFsPath(uri);
          } catch (pathError) {
            console.warn('[IMPORT] Failed to convert URI to path, trying fallback:', pathError);
            // Fallback: strip file:// scheme
            pdfPath = uri.startsWith('file://') ? uri.slice(7) : uri;
          }

          // Verify the file exists before trying to rasterize
          if (!pdfPath) {
            throw new Error('Failed to convert PDF URI to file path');
          }

          const fileExists = await RNFS.exists(pdfPath);
          if (!fileExists) {
            // Try alternative path formats
            const alternatives = [
              pdfPath,
              uri.startsWith('file://') ? uri.slice(7) : uri,
              pdfPath.startsWith('/private') ? pdfPath.replace('/private', '') : null,
            ].filter(Boolean) as string[];

            let foundPath: string | null = null;
            for (const altPath of alternatives) {
              if (await RNFS.exists(altPath)) {
                foundPath = altPath;
                break;
              }
            }

            if (!foundPath) {
              throw new Error(
                `PDF file not found at any of these paths: ${alternatives.join(', ')}`
              );
            }
            pdfPath = foundPath;
          }

          console.log('[IMPORT] Rasterizing PDF from path:', pdfPath);
          const pagePaths = await PDFRasterizer.rasterize(pdfPath, 250);
          console.log(
            '[IMPORT] pdf rasterized:',
            pagePaths.length,
            'pages @250dpi',
          );

          // Add each rasterized page (for thumbnails/OCR, but export will use original PDF)
          for (const pagePath of pagePaths) {
            const pageUri = await putPageFile(doc.id, pagePath, pages.length);
            const dimensions = await getImageDimensions(pageUri);
            pages.push(newPage(pageUri, dimensions.width, dimensions.height));
          }

          // Update document with pages and add to imported docs
          doc.pages = pages;
          importedDocs.push(doc);
          console.log('[IMPORT] created doc=', doc.id, 'pages=', pages.length);
        } catch (error: any) {
          console.error('[IMPORT] PDF rasterization failed:', error);
          console.error('[IMPORT] Error details:', {
            message: error?.message,
            stack: error?.stack,
            uri,
            fileName,
          });
          log('[IMPORT] PDF rasterization failed for', fileName, error);
          // Continue processing other files instead of stopping
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

          // Update document with pages and add to imported docs
          doc.pages = pages;
          importedDocs.push(doc);
          console.log('[IMPORT] created doc=', doc.id, 'pages=', pages.length);
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

    console.log('[IMPORT] Import complete. Created', importedDocs.length, 'documents');
    return importedDocs;
  } catch (err: any) {
    if (isCancel(err)) {
      console.log('[IMPORT] picker cancelled');
      return []; // Do not show error UI
    }
    console.error('[IMPORT] File import failed:', err);
    log('[IMPORT] File import failed:', err);
    return [];
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
    // Use date-based naming for camera scans (photos import)
    const defaultName = getNextDefaultDocName(now);
    const doc = newDoc(defaultName);
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

