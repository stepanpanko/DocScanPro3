/**
 * Storage Sync Abstraction Layer
 * 
 * This module provides an abstraction for storage that can be extended
 * to support cloud synchronization in the future.
 * 
 * Current implementation: Local storage only (MMKV + File System)
 * Future implementation: CloudKit, Firebase, or custom backend
 */

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

import { MMKV } from 'react-native-mmkv';

import type { Doc, Folder } from './types';

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

// ---- Storage Sync Interface ----

export interface StorageSyncAdapter {
  /**
   * Initialize the sync adapter (e.g., authenticate, setup listeners)
   */
  initialize(): Promise<void>;
  
  /**
   * Sync documents index to cloud
   */
  syncDocsIndex(docs: Doc[]): Promise<void>;
  
  /**
   * Sync folders index to cloud
   */
  syncFoldersIndex(folders: Folder[]): Promise<void>;
  
  /**
   * Upload a document file to cloud storage
   */
  uploadDocumentFile(docId: string, filePath: string): Promise<string>;
  
  /**
   * Download a document file from cloud storage
   */
  downloadDocumentFile(docId: string, filePath: string): Promise<string>;
  
  /**
   * Delete a document file from cloud storage
   */
  deleteDocumentFile(docId: string, filePath: string): Promise<void>;
  
  /**
   * Check if sync is enabled and available
   */
  isSyncEnabled(): boolean;
  
  /**
   * Get sync status
   */
  getSyncStatus(): Promise<{
    enabled: boolean;
    lastSyncTime: number | null;
    pendingUploads: number;
    pendingDownloads: number;
  }>;
}

// ---- Local Storage Adapter (Current Implementation) ----

class LocalStorageAdapter implements StorageSyncAdapter {
  async initialize(): Promise<void> {
    // Local storage doesn't need initialization
  }

  async syncDocsIndex(docs: Doc[]): Promise<void> {
    // Local storage - data is already saved via storage.ts
    // This is a no-op for local storage
  }

  async syncFoldersIndex(folders: Folder[]): Promise<void> {
    // Local storage - data is already saved via storage.ts
    // This is a no-op for local storage
  }

  async uploadDocumentFile(docId: string, filePath: string): Promise<string> {
    // Local storage - file is already local
    return filePath;
  }

  async downloadDocumentFile(docId: string, filePath: string): Promise<string> {
    // Local storage - file is already local
    return filePath;
  }

  async deleteDocumentFile(docId: string, filePath: string): Promise<void> {
    // Local storage - file deletion is handled by storage.ts
  }

  isSyncEnabled(): boolean {
    return false; // Local storage only
  }

  async getSyncStatus(): Promise<{
    enabled: boolean;
    lastSyncTime: number | null;
    pendingUploads: number;
    pendingDownloads: number;
  }> {
    return {
      enabled: false,
      lastSyncTime: null,
      pendingUploads: 0,
      pendingDownloads: 0,
    };
  }
}

// ---- CloudKit Adapter (Future Implementation) ----
// TODO: Implement CloudKit adapter for iOS
// This would use react-native-cloudkit or native CloudKit APIs

// ---- Firebase Adapter (Future Implementation) ----
// TODO: Implement Firebase adapter for cross-platform sync
// This would use @react-native-firebase/storage and firestore

// ---- Current Adapter Instance ----

let currentAdapter: StorageSyncAdapter = new LocalStorageAdapter();

/**
 * Set the storage sync adapter
 * This allows switching between local, CloudKit, Firebase, etc.
 */
export function setStorageAdapter(adapter: StorageSyncAdapter): void {
  currentAdapter = adapter;
}

/**
 * Get the current storage sync adapter
 */
export function getStorageAdapter(): StorageSyncAdapter {
  return currentAdapter;
}

/**
 * Initialize storage sync
 * Call this on app startup
 */
export async function initializeStorageSync(): Promise<void> {
  try {
    await currentAdapter.initialize();
    console.log('[StorageSync] Initialized storage adapter');
  } catch (error) {
    console.error('[StorageSync] Failed to initialize:', error);
    // Fallback to local storage on error
    currentAdapter = new LocalStorageAdapter();
  }
}

/**
 * Sync all data to cloud
 */
export async function syncAllData(docs: Doc[], folders: Folder[]): Promise<void> {
  if (!currentAdapter.isSyncEnabled()) {
    return; // Skip if sync is not enabled
  }

  try {
    await Promise.all([
      currentAdapter.syncDocsIndex(docs),
      currentAdapter.syncFoldersIndex(folders),
    ]);
    console.log('[StorageSync] Synced all data to cloud');
  } catch (error) {
    console.error('[StorageSync] Failed to sync data:', error);
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus() {
  return currentAdapter.getSyncStatus();
}

// ---- iCloud Backup Helper ----

/**
 * Check if iCloud backup is available on iOS
 * Note: This requires the app to be properly configured with iCloud entitlements
 */
export async function checkiCloudBackupAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }

  try {
    // Check if Documents directory exists and is accessible
    const docsPath = RNFS.DocumentDirectoryPath;
    const exists = await RNFS.exists(docsPath);
    
    // On iOS, files in Documents directory are automatically backed up to iCloud
    // if the user has iCloud enabled and the app has proper entitlements
    return exists;
  } catch {
    return false;
  }
}

/**
 * Get information about storage and backup status
 */
export async function getStorageInfo(): Promise<{
  local: boolean;
  cloudSync: boolean;
  iCloudBackup: boolean;
  storagePath: string;
}> {
  const iCloudAvailable = await checkiCloudBackupAvailable();
  const syncEnabled = currentAdapter.isSyncEnabled();

  return {
    local: true, // Always true - we always have local storage
    cloudSync: syncEnabled,
    iCloudBackup: iCloudAvailable && Platform.OS === 'ios',
    storagePath: `${RNFS.DocumentDirectoryPath}/DocScanPro`,
  };
}

