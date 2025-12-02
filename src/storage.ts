import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

import { MMKV } from 'react-native-mmkv';

import type { Doc, Folder } from './types';

import { toReadableFsPath } from './utils/paths';
import { log } from './utils/log';
import { sanitizeFilename, stripExtension } from './utils/filename';

type Store = { getString: (k: string) => string | null; set: (k: string, v: string) => void };

const mem: Record<string, string> = {};

const memoryStore = (): Store => ({
  getString: k => mem[k] ?? null,
  set: (k, v) => {
    mem[k] = v;
  },
});

const parse = <T,>(s: string | null, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

let store: Store | null = null;

function makeStore(): Store {
  const g = globalThis as any;
  const hasJSI =
    g.HermesInternal != null ||
    typeof g.nativeCallSyncHook === 'function' ||
    typeof g.__turboModuleProxy === 'function';

  if (!hasJSI) return memoryStore();

  try {
    const kv = new MMKV({ id: 'DocScanPro' });
    return {
      getString: k => kv.getString(k) ?? null,
      set: (k, v) => kv.set(k, v),
    };
  } catch {
    // If MMKV throws because it's still too early, never crash — just use memory.
    return memoryStore();
  }
}

function getStore(): Store {
  if (!store) store = makeStore();
  return store;
}

// ---- public API (named functions) ----

export function getDocsIndex(): Doc[] {
  return parse(getStore().getString('docs-index'), []);
}

export function saveDocsIndex(docs: Doc[]) {
  getStore().set('docs-index', JSON.stringify(docs));
}

export function getFoldersIndex(): Folder[] {
  return parse(getStore().getString('folders-index'), []);
}

export function saveFoldersIndex(folders: Folder[]) {
  getStore().set('folders-index', JSON.stringify(folders));
}

/**
 * Generate a unique ID for folders/documents.
 * Uses timestamp + random to ensure uniqueness.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create a new folder with a unique ID and current timestamp.
 * Does NOT save to storage - caller must call saveFoldersIndex.
 */
export function createFolder(name: string): Folder {
  return {
    id: generateId(),
    name,
    createdAt: Date.now(),
  };
}

/**
 * Move a document to a folder (or remove from folder if folderId is null).
 * Updates storage immediately.
 * Passing null means "no folder" (document appears in "All" view).
 */
export function moveDocToFolder(docId: string, folderId: string | null): void {
  const docs = getDocsIndex();
  const idx = docs.findIndex(d => d.id === docId);
  if (idx === -1) {
    console.warn('[moveDocToFolder] Document not found:', docId);
    return;
  }

  // Update the folderId field without mutating the original
  const doc = docs[idx];
  if (!doc) return;
  
  docs[idx] = { ...doc, folderId } as Doc;
  saveDocsIndex(docs);
}

const ROOT = `${RNFS.DocumentDirectoryPath}/DocScanPro`;

async function ensureRoot() {
  const exists = await RNFS.exists(ROOT);
  if (!exists) await RNFS.mkdir(ROOT);
}

async function docDir(docId: string) {
  await ensureRoot();
  const dir = `${ROOT}/${docId}`;
  if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
  return dir;
}

/**
 * Get a unique file path in a directory by appending -1, -2, etc. if needed
 */
async function getUniqueFilePath(
  dir: string,
  baseName: string,
  ext: string,
): Promise<string> {
  const safeBase = sanitizeFilename(baseName) || 'Document';
  let candidate = `${dir}/${safeBase}${ext}`;
  let index = 1;

  // If something already exists, append -1, -2, etc.
  while (await RNFS.exists(candidate)) {
    candidate = `${dir}/${safeBase}-${index}${ext}`;
    index += 1;
  }

  return candidate;
}

export async function putPageFile(docId: string, localUri: string, idx: number) {
  console.log('[putPageFile] called with:', { docId, localUri, idx });
  
  const dir = await docDir(docId);
  
  // 1) Try the "nice" resolved path first
  let srcPath: string | null = null;
  try {
    srcPath = await toReadableFsPath(localUri);
  } catch {
    /* ignore */
  }

  const guessedName = (srcPath ?? localUri).split('/').pop() || `page-${idx + 1}.jpg`;
  const ext = (guessedName.split('.').pop() || 'jpg').toLowerCase();
  const target = `${dir}/page-${String(idx + 1).padStart(3, '0')}.${ext}`;

  // A. resolved POSIX path exists → copy
  if (srcPath && (await RNFS.exists(srcPath))) {
    console.log('[putPageFile] copying from resolved path:', srcPath, 'to', target);
    await RNFS.copyFile(srcPath, target);
    return `file://${target}`;
  }

  // B. iOS Photos asset URI → copy via assets API directly to target
  if (
    Platform.OS === 'ios' &&
    (localUri.startsWith('ph://') || localUri.startsWith('assets-library://'))
  ) {
    console.log('[putPageFile] copying iOS asset directly to target:', target);
    await RNFS.copyAssetsFileIOS(localUri, target, 0, 0, 1.0, 0.85, 'contain');
    return `file://${target}`;
  }

  // C. Some providers only work when we keep the file:// scheme on copy()
  if (localUri.startsWith('file://')) {
    const noScheme = localUri.slice(7);
    // try with scheme stripped
    if (await RNFS.exists(noScheme)) {
      console.log('[putPageFile] copying from stripped path:', noScheme, 'to', target);
      await RNFS.copyFile(noScheme, target);
      return `file://${target}`;
    }
    // try removing /private (rare sandbox quirk)
    const alt = noScheme.startsWith('/private/') ? noScheme.replace('/private', '') : null;
    if (alt && (await RNFS.exists(alt))) {
      console.log('[putPageFile] copying from alt path (no /private):', alt, 'to', target);
      await RNFS.copyFile(alt, target);
      return `file://${target}`;
    }
    // last resort: some iOS providers accept copyFile with the scheme
    try {
      console.log('[putPageFile] trying copyFile with scheme stripped:', localUri.replace(/^file:\/\//, ''), 'to', target);
      await RNFS.copyFile(localUri.replace(/^file:\/\//, ''), target);
      return `file://${target}`;
    } catch {
      /* ignore */
    }
  }

  // D. Give a crystal clear error for logs
  throw new Error(
    `[putPageFile] Source not found. localUri=${localUri} resolved=${srcPath ?? 'null'}`
  );
}

export async function putOriginalPdf(
  docId: string,
  pdfUri: string,
  originalFilename?: string,
): Promise<string> {
  const dir = await docDir(docId);
  
  // Use original filename if provided, otherwise default to 'original'
  const baseName = originalFilename
    ? stripExtension(originalFilename) || 'original'
    : 'original';
  const target = await getUniqueFilePath(dir, baseName, '.pdf');
  
  log('[putOriginalPdf] Starting copy', { docId, pdfUri, target, originalFilename });
  
  // Convert URI to path
  let srcPath: string | null = null;
  try {
    srcPath = await toReadableFsPath(pdfUri);
  } catch {
    /* ignore */
  }
  
  // Try resolved path first
  if (srcPath && (await RNFS.exists(srcPath))) {
    log('[putOriginalPdf] copying from resolved path:', srcPath, 'to', target);
    await RNFS.copyFile(srcPath, target);
    log('[putOriginalPdf] Successfully copied PDF to local sandbox:', target);
    return target;
  }
  
  // Try with file:// scheme stripped
  if (pdfUri.startsWith('file://')) {
    const noScheme = pdfUri.slice(7);
    if (await RNFS.exists(noScheme)) {
      log('[putOriginalPdf] copying from stripped path:', noScheme, 'to', target);
      await RNFS.copyFile(noScheme, target);
      log('[putOriginalPdf] Successfully copied PDF to local sandbox:', target);
      return target;
    }
    // Try removing /private
    const alt = noScheme.startsWith('/private/') ? noScheme.replace('/private', '') : null;
    if (alt && (await RNFS.exists(alt))) {
      log('[putOriginalPdf] copying from alt path (no /private):', alt, 'to', target);
      await RNFS.copyFile(alt, target);
      log('[putOriginalPdf] Successfully copied PDF to local sandbox:', target);
      return target;
    }
  }
  
  throw new Error(
    `[putOriginalPdf] Source PDF not found. pdfUri=${pdfUri} resolved=${srcPath ?? 'null'}`
  );
}

export async function removeDocFiles(docId: string) {
  const dir = `${ROOT}/${docId}`;
  if (await RNFS.exists(dir)) await RNFS.unlink(dir);
}
