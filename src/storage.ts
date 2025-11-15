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
  // Works for file://, ph://, assets-library://
  const srcPath = await toReadableFsPath(localUri);
  console.log('[putPageFile] resolved srcPath:', srcPath);
  
  const srcName = srcPath.split('/').pop() || `page-${idx + 1}.jpg`;
  const ext = (srcName.split('.').pop() || 'jpg').toLowerCase();
  const target = `${dir}/page-${String(idx + 1).padStart(3, '0')}.${ext}`;
  console.log('[putPageFile] target path:', target);

  const ok = await RNFS.exists(srcPath);
  if (!ok) {
    const error = `Source not found: ${srcPath} (from URI: ${localUri})`;
    console.error('[putPageFile]', error);
    throw new Error(error);
  }

  console.log('[putPageFile] copying from', srcPath, 'to', target);
  await RNFS.copyFile(srcPath, target);
  console.log('[putPageFile] copy successful');

  return `file://${target}`;
}

export async function removeDocFiles(docId: string) {
  const dir = `${ROOT}/${docId}`;
  if (await RNFS.exists(dir)) await RNFS.unlink(dir);
}
