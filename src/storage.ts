import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

import { MMKV } from 'react-native-mmkv';

import type { Doc, Folder } from './types';

import { toReadableFsPath } from './utils/paths';

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
    await RNFS.copyAssetsFileIOS(localUri, target, 0, 0, 1.0, 0.9, 'contain');
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

export async function removeDocFiles(docId: string) {
  const dir = `${ROOT}/${docId}`;
  if (await RNFS.exists(dir)) await RNFS.unlink(dir);
}
