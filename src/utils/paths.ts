// src/utils/paths.ts
// Utility functions for handling file paths and URIs

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

export function stripFileScheme(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

export function toFsPath(uri: string): string {
  const noScheme = uri.startsWith('file://') ? uri.slice(7) : uri;
  return decodeURI(noScheme);
}

export function toBestPath(uri: string) {
  // Some native libs want paths without scheme, some accept file://.
  // Try file:// first, fall back to plain path.
  const plain = uri.startsWith('file://') ? uri.slice(7) : uri;
  return { withScheme: uri, plain };
}

/**
 * Converts various URI formats to a readable file system path.
 * Handles file://, ph://, and assets-library:// URIs.
 * For iOS asset URIs, copies the file to a temporary location.
 */
export async function toReadableFsPath(uri: string): Promise<string> {
  if (!uri) throw new Error('Empty URI');

  console.log('[toReadableFsPath] input URI:', uri);

  // Fast path: file://
  if (uri.startsWith('file://')) {
    const without = uri.slice(7);
    // try both decoders; return whichever exists / looks sane
    try {
      return decodeURI(without);
    } catch {}
    try {
      return decodeURIComponent(without);
    } catch {}
    return without;
  }

  // iOS Photos library
  if (
    Platform.OS === 'ios' &&
    (uri.startsWith('ph://') || uri.startsWith('assets-library://'))
  ) {
    const dest = `${RNFS.TemporaryDirectoryPath}/${Date.now()}-asset.jpg`;
    // width=0 height=0 (keep original), scale=1.0, compression=0.9, resizeMode='contain'
    await RNFS.copyAssetsFileIOS(uri, dest, 0, 0, 1.0, 0.9, 'contain');
    return dest;
  }

  // Default: strip file:// if present
  return uri.replace(/^file:\/\//, '');
}

