// App.tsx
import 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as React from 'react';
import { Alert, AppState, View, Text, NativeModules } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FilterProcessorProvider } from './src/FilterProcessor';
import { RootStackParamList } from './src/navigation/types';
import { ocrQueue } from './src/ocr/queue';
import { buildPdfFromImages, shareFile } from './src/pdf';
import EditDocumentScreen from './src/screens/EditDocumentScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import {
  getDocsIndex,
  saveDocsIndex,
  getFoldersIndex,
  saveFoldersIndex,
  putPageFile,
  removeDocFiles,
} from './src/storage';
import { Doc, Page, Folder, newDoc, newPage } from './src/types';
import { getImageDimensions } from './src/utils/images';
import { log } from './src/utils/log';
import { defaultDocTitle } from './src/utils/naming';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  // Check if native modules are available
  console.log('[APP] Native modules check:');
  console.log('[APP] VisionOCR available:', !!NativeModules.VisionOCR);
  console.log('[APP] PDFRasterizer available:', !!NativeModules.PDFRasterizer);

  // Safely initialize state from storage, with fallback to empty arrays if storage fails
  const [docs, setDocs] = React.useState<Doc[]>(() => {
    try {
      return getDocsIndex();
    } catch (e) {
      console.error('[APP] Failed to load docs index:', e);
      return [];
    }
  });
  const [folders, setFolders] = React.useState<Folder[]>(() => {
    try {
      return getFoldersIndex();
    } catch (e) {
      console.error('[APP] Failed to load folders index:', e);
      return [];
    }
  });

  // Listen to app state changes to resume OCR queue
  React.useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        console.log('[OCR][auto] app active — resuming queue');
        log('[OCR] App became active, OCR queue will continue automatically');
        // The queue will automatically continue processing if there are pending documents
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      subscription?.remove();
    };
  }, []);

  // removed unused updateDoc

  async function deleteDoc(id: string) {
    setDocs(prev => {
      const next = prev.filter(d => d.id !== id);
      saveDocsIndex(next);
      return next;
    });
    await removeDocFiles(id);
  }

  async function createFromScan(imageUris: string[]) {
    try {
      if (!imageUris?.length) return;
      const doc = newDoc(defaultDocTitle());
      const pages: Page[] = [];
      for (let i = 0; i < imageUris.length; i++) {
        const uri = imageUris[i];
        if (!uri) continue;
        const stored = await putPageFile(doc.id, uri, i);
        const dimensions = await getImageDimensions(stored);
        pages.push(newPage(stored, dimensions.width, dimensions.height));
      }
      const created: Doc = { ...doc, pages };
      setDocs(prev => {
        const next = [created, ...prev];
        saveDocsIndex(next);
        return next;
      });

      // Auto-enqueue the new document for OCR processing
      console.log('[OCR][auto] new document created', { docId: created.id });
      log('[OCR] New document created, auto-enqueueing for OCR:', created.id);
      requestAnimationFrame(() => ocrQueue.enqueueDoc(created.id));
    } catch (e: any) {
      Alert.alert('Create failed', String(e?.message || e));
    }
  }

  async function startScan() {
    try {
      const DocumentScanner =
        require('react-native-document-scanner-plugin').default;
      const result = await DocumentScanner.scanDocument({
        maxNumDocuments: 12,
        cropping: false,
      });
      if (result?.scannedImages?.length) {
        await createFromScan(result.scannedImages);
      }
    } catch (e: any) {
      Alert.alert('Scanner error', String(e?.message || e));
    }
  }

  function handleImport(doc: Doc) {
    setDocs(prev => {
      const next = [doc, ...prev];
      saveDocsIndex(next);
      return next;
    });
    // Enqueue after state/storage are updated
    requestAnimationFrame(() => ocrQueue.enqueueDoc(doc.id));
  }

  // Folder management functions
  function createFolder(name: string): Folder {
    const folder: Folder = {
      id: String(Date.now()),
      name,
      createdAt: Date.now(),
    };
    setFolders(prev => {
      const next = [...prev, folder];
      saveFoldersIndex(next);
      return next;
    });
    return folder;
  }

  function renameFolder(id: string, name: string) {
    if (name === '__DELETE__') {
      setFolders(prev => {
        const next = prev.filter(f => f.id !== id);
        saveFoldersIndex(next);
        return next;
      });
      setDocs(prev => {
        const next = prev.map(d =>
          d.folderId === id ? { ...d, folderId: null } : d,
        );
        saveDocsIndex(next);
        return next;
      });
    } else {
      setFolders(prev => {
        const next = prev.map(f => (f.id === id ? { ...f, name } : f));
        saveFoldersIndex(next);
        return next;
      });
    }
  }

  function moveDoc(docId: string, folderId: string | null) {
    console.log('[MOVE] Moving doc', docId, 'to folder', folderId);
    setDocs(prev => {
      const next = prev.map(d => {
        if (d.id === docId) {
          console.log(
            '[MOVE] Updating doc',
            d.title,
            'from folder',
            d.folderId,
            'to folder',
            folderId,
          );
          return { ...d, folderId };
        }
        return d;
      });
      saveDocsIndex(next);
      console.log(
        '[MOVE] Updated docs:',
        next.map(d => ({ id: d.id, title: d.title, folderId: d.folderId })),
      );
      return next;
    });
  }

  function renameDoc(docId: string, title: string) {
    setDocs(prev => {
      const next = prev.map(d => (d.id === docId ? { ...d, title } : d));
      saveDocsIndex(next);
      return next;
    });
  }

  // Edit screen handlers
  function handleRename(docId: string, title: string) {
    renameDoc(docId, title);
  }

  function handleDeletePage(docId: string, pageId: string) {
    setDocs(prev =>
      prev.map(d =>
        d.id === docId
          ? { ...d, pages: d.pages.filter(p => p.id !== pageId) }
          : d,
      ),
    );
  }

  function handleRotatePage(docId: string, pageId: string) {
    setDocs(prev =>
      prev.map(d =>
        d.id === docId
          ? {
              ...d,
              pages: d.pages.map(p =>
                p.id === pageId
                  ? {
                      ...p,
                      rotation: (((p.rotation ?? 0) + 90) % 360) as
                        | 0
                        | 90
                        | 180
                        | 270,
                    }
                  : p,
              ),
            }
          : d,
      ),
    );
  }

  function handleFilter(
    docId: string,
    pageId: string,
    filter: 'color' | 'grayscale' | 'bw',
  ) {
    setDocs(prev =>
      prev.map(d =>
        d.id === docId
          ? {
              ...d,
              pages: d.pages.map(p => (p.id === pageId ? { ...p, filter } : p)),
            }
          : d,
      ),
    );
  }

  function handleAutoContrast(docId: string, pageId: string, enabled: boolean) {
    setDocs(prev =>
      prev.map(d =>
        d.id === docId
          ? {
              ...d,
              pages: d.pages.map(p =>
                p.id === pageId ? { ...p, autoContrast: enabled } : p,
              ),
            }
          : d,
      ),
    );
  }

  function handleApplyPageEdits(
    docId: string,
    pageId: string,
    patch: {
      rotation?: 0 | 90 | 180 | 270;
      filter?: 'color' | 'grayscale' | 'bw';
      autoContrast?: boolean;
      uri?: string;
      width?: number;
      height?: number;
    },
  ) {
    setDocs(prev => {
      const next = prev.map(d => {
        if (d.id !== docId) return d;
        return {
          ...d,
          pages: d.pages.map(p => (p.id === pageId ? { ...p, ...patch } : p)),
        };
      });
      saveDocsIndex(next);
      return next;
    });

    // Re-OCR this page so the invisible text matches the new look
    try {
      // If you have page-level enqueue; else enqueue the full doc
      // ocrQueue.enqueuePage(docId, pageId);
      ocrQueue.enqueueDoc(docId);
    } catch (e) {
      console.warn('[OCR] enqueue failed', e);
    }
  }

  async function handleApplyCrop(
    docId: string,
    pageId: string,
    croppedUri: string,
    width: number,
    height: number,
  ) {
    const doc = docs.find(d => d.id === docId);
    if (!doc) return;

    const pageIndex = doc.pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return;

    try {
      // Copy cropped image to doc storage
      const storedUri = await putPageFile(docId, croppedUri, pageIndex);

      // Update page with new URI and dimensions
      handleApplyPageEdits(docId, pageId, {
        uri: storedUri,
        width,
        height,
      });
    } catch (error) {
      log('[CROP] Failed to apply crop:', error);
      Alert.alert(
        'Crop failed',
        String(error instanceof Error ? error.message : error),
      );
    }
  }

  async function handleExport(docId: string) {
    const doc = docs.find(d => d.id === docId);
    if (!doc) return;
    try {
      log('[EXPORT] Starting export for document:', doc.id);

      // Build PDF from document (will process images with filters/rotation)
      const pdfUri = await buildPdfFromImages(doc.id, doc);

      // Share the PDF
      await shareFile(pdfUri);

      log('[EXPORT] Export completed successfully');
    } catch (e: any) {
      log('[EXPORT] Export failed:', e);
      Alert.alert('Export failed', String(e?.message || e));
    }
  }

  async function handleAddPages(docId: string) {
    try {
      const DocumentScanner =
        require('react-native-document-scanner-plugin').default;
      const result = await DocumentScanner.scanDocument({
        maxNumDocuments: 12,
        cropping: false,
      });

      if (result?.scannedImages?.length) {
        const doc = docs.find(d => d.id === docId);
        if (!doc) return;

        // Add new pages to existing document
        const newPages: Page[] = [];
        for (let i = 0; i < result.scannedImages.length; i++) {
          const stored = await putPageFile(
            docId,
            result.scannedImages[i],
            doc.pages.length + i,
          );
          const dimensions = await getImageDimensions(stored);
          newPages.push(newPage(stored, dimensions.width, dimensions.height));
        }

        // Update document with new pages
        const updatedDoc = { ...doc, pages: [...doc.pages, ...newPages] };
        setDocs(prev => {
          const next = prev.map(d => (d.id === docId ? updatedDoc : d));
          saveDocsIndex(next);
          return next;
        });

        // Enqueue for OCR processing
        requestAnimationFrame(() => ocrQueue.enqueueDoc(docId));
      }
    } catch (e: any) {
      Alert.alert('Scanner error', String(e?.message || e));
    }
  }

  return (
    <SafeAreaProvider>
      <FilterProcessorProvider>
        <NavigationContainer>
          <Stack.Navigator
            // @ts-expect-error React Navigation v7 types mark id as undefined; string id is valid at runtime
            id="root-stack"
            screenOptions={{
              gestureEnabled: true,
              fullScreenGestureEnabled: true,
              animation: 'default',
              presentation: 'card',
              headerStyle: {
                backgroundColor: '#0B0F17',
              },
              headerTintColor: '#E6EDF7',
              headerTitleStyle: {
                fontWeight: '700',
              },
            }}
          >
            <Stack.Screen name="Library" options={{ headerShown: false }}>
              {props => (
                <LibraryScreen
                  {...props}
                  onCreate={startScan}
                  docs={docs}
                  folders={folders}
                  onDelete={deleteDoc}
                  onImport={handleImport}
                  createFolder={createFolder}
                  renameFolder={renameFolder}
                  moveDoc={moveDoc}
                  renameDoc={renameDoc}
                />
              )}
            </Stack.Screen>
            <Stack.Screen
              name="EditDocument"
              options={{
                headerShown: false,
                gestureEnabled: false,
                fullScreenGestureEnabled: false,
              }}
            >
              {props => {
                const doc = docs.find(d => d.id === props.route.params?.docId);
                if (!doc) {
                  return (
                    <View
                      style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: '#0B0F17',
                      }}
                    >
                      <Text style={{ color: '#E6EDF7' }}>
                        Document not found
                      </Text>
                    </View>
                  );
                }
                return (
                  <EditDocumentScreen
                    {...props}
                    doc={doc}
                    onRename={handleRename}
                    onDeletePage={handleDeletePage}
                    onRotatePage={handleRotatePage}
                    onFilter={handleFilter}
                    onAutoContrast={handleAutoContrast}
                    onApplyPageEdits={handleApplyPageEdits}
                    onApplyCrop={handleApplyCrop}
                    onExport={handleExport}
                    onDeleteDoc={deleteDoc}
                    onAddPages={handleAddPages}
                  />
                );
              }}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </FilterProcessorProvider>
    </SafeAreaProvider>
  );
}

