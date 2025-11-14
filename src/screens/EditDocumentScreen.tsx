import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
  FlatList,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CropModal from '../components/crop/CropModal';
import FullscreenZoom from '../components/FullscreenZoom';
import PageCarousel from '../components/PageCarousel';
import ZoomableImage from '../components/ZoomableImage';
import type { RootStackParamList, Doc } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type Props = {
  doc: Doc;
  onExport: (docId: string) => void;
  onDeleteDoc: (docId: string) => void;
  onDeletePage: (docId: string, pageId: string) => void;
  onAddPages: (docId: string) => void;
  onApplyPageEdits: (
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
  ) => void;
  onApplyCrop?: (
    docId: string,
    pageId: string,
    uri: string,
    width: number,
    height: number,
  ) => void;
  onRename?: (docId: string, title: string) => void;
  onRotatePage?: (docId: string, pageId: string) => void;
  onFilter?: (
    docId: string,
    pageId: string,
    filter: 'color' | 'grayscale' | 'bw',
  ) => void;
  onAutoContrast?: (docId: string, pageId: string, enabled: boolean) => void;
};

export default function EditDocumentScreen({
  doc,
  onExport,
  onDeleteDoc,
  onDeletePage,
  onAddPages,
  onApplyPageEdits,
  onApplyCrop,
  onRename: _onRename,
  onRotatePage: _onRotatePage,
  onFilter: _onFilter,
  onAutoContrast: _onAutoContrast,
}: Props) {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const startIndex = ((route.params as any)?.startIndex ?? 0) as number;

  const [viewMode, setViewMode] = useState<'single' | 'grid' | 'zoomed'>(
    'single',
  );
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [currentPageIndex, setCurrentPageIndex] = useState(startIndex);
  const [editMode, setEditMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [cropModalVisible, setCropModalVisible] = useState(false);

  const { width } = Dimensions.get('window');
  const currentPage = doc.pages[currentPageIndex] ?? null;

  // Local rotation + dirty flag for edit mode
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(
    currentPage?.rotation ?? 0,
  );
  const [dirty, setDirty] = useState(false);

  // Track the edit canvas width for edge-to-edge display
  const [canvasW, setCanvasW] = useState<number | undefined>(undefined);

  // Reset draft when page changes or when entering edit mode
  useEffect(() => {
    setRotation((currentPage?.rotation ?? 0) as 0 | 90 | 180 | 270);
    setDirty(false);
  }, [currentPageIndex, editMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteDoc = () => {
    Alert.alert('Delete', `Delete "${doc.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDeleteDoc(doc.id),
      },
    ]);
  };

  const handleEditMode = () => setEditMode(true);

  const handleBack = () => {
    if (editMode && dirty) {
      Alert.alert('Unsaved changes', 'Save your edits?', [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setDirty(false);
            setEditMode(false);
          },
        },
        { text: 'Save', onPress: () => handleSave() },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      if (editMode) setEditMode(false);
      else navigation.goBack();
    }
  };

  // Save persists rotation to the page
  const handleSave = () => {
    const p = currentPage;
    if (!p) return;
    onApplyPageEdits(doc.id, p.id, { rotation });
    setDirty(false);
    setEditMode(false);
  };

  const handleGridToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (viewMode === 'single') setViewMode('grid');
    else {
      setViewMode('single');
      setCurrentPageIndex(0);
    }
  };

  const handlePageSelect = (index: number) => {
    if (viewMode === 'grid') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSelectedPageIndex(index);
      setViewMode('zoomed');
    }
  };

  const handleZoomOut = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode('grid');
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport(doc.id);
    } finally {
      setIsExporting(false);
    }
  };

  const handleAddPages = () => onAddPages(doc.id);

  // --- Edit actions (Rotate now implemented) ---
  const pressCrop = () => {
    if (currentPage) {
      setCropModalVisible(true);
    }
  };
  const pressRotate = () => {
    setRotation(prev => ((prev + 90) % 360) as 0 | 90 | 180 | 270);
    setDirty(true);
  };
  const pressFilters = () =>
    console.log('[Edit] Filters pressed for page', currentPage?.id);
  const pressDeletePage = () => {
    if (!currentPage) return;
    Alert.alert('Delete Page', 'Delete this page?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDeletePage(doc.id, currentPage.id),
      },
    ]);
  };

  const renderGridView = () => {
    const numColumns = 2;
    const itemSize = (width - 60) / numColumns;

    return (
      <FlatList
        data={doc.pages}
        numColumns={numColumns}
        keyExtractor={(item, index) => `${item.uri}-${index}`}
        contentContainerStyle={styles.gridContainer}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[
              styles.gridItem,
              { width: itemSize, height: itemSize * 1.3 },
            ]}
            onPress={() => handlePageSelect(index)}
            activeOpacity={0.8}
          >
            <Image
              source={{ uri: item.uri }}
              style={[
                styles.gridImage,
                { transform: [{ rotate: `${item.rotation ?? 0}deg` }] },
              ]}
              resizeMode="cover"
            />
            <Text style={styles.pageLabel}>Page: {index + 1}</Text>
          </TouchableOpacity>
        )}
      />
    );
  };

  const renderZoomedView = () => {
    const selectedPage = doc.pages[selectedPageIndex];
    if (!selectedPage) return null;
    return <FullscreenZoom page={selectedPage} onClose={handleZoomOut} />;
  };

  const renderSingleView = () => {
    if (editMode) {
      const p = currentPage;
      if (!p) {
        return (
          <View style={styles.editCanvas}>
            <Text style={{ color: '#FFF' }}>No page found</Text>
          </View>
        );
      }
      const uri = p.uri || '';
      return (
        <View
          style={styles.editCanvas}
          onLayout={e => setCanvasW(e.nativeEvent.layout.width)}
        >
          {uri ? (
            canvasW !== undefined ? (
              <ZoomableImage
                key={`${p.id}:${uri}:${rotation}:${canvasW}`}
                page={p}
                sourceUri={uri}
                mode="fit"
                rotation={rotation}
                containerWidth={canvasW}
              />
            ) : (
              <ZoomableImage
                key={`${p.id}:${uri}:${rotation}:auto`}
                page={p}
                sourceUri={uri}
                mode="fit"
                rotation={rotation}
              />
            )
          ) : (
            <Text style={{ color: '#FF9AA7' }}>Empty URI for page</Text>
          )}
        </View>
      );
    }

    return (
      <View style={styles.canvas}>
        <PageCarousel
          pages={doc.pages}
          initialIndex={currentPageIndex}
          onIndexChange={setCurrentPageIndex}
        />
        <Text style={styles.pageCount}>
          {currentPageIndex + 1} / {doc.pages.length}
        </Text>
      </View>
    );
  };

  const renderContent = () => {
    switch (viewMode) {
      case 'grid':
        return renderGridView();
      case 'zoomed':
        return renderZoomedView();
      default:
        return renderSingleView();
    }
  };

  const safeEdges =
    viewMode === 'zoomed'
      ? (['left', 'right', 'bottom'] as const) // NO TOP inset in zoomed mode
      : (['top', 'left', 'right', 'bottom'] as const);

  return (
    <SafeAreaView style={styles.container} edges={safeEdges}>
      {/* Top bar hidden in zoomed mode */}
      {viewMode !== 'zoomed' && (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>

          {!editMode && <Text style={styles.title}>{doc.title}</Text>}

          {/* Save on the right in edit mode */}
          {editMode ? (
            <TouchableOpacity
              onPress={dirty ? handleSave : undefined}
              disabled={!dirty}
              style={[styles.saveBtn, !dirty && styles.saveBtnDisabled]}
            >
              <Text
                style={[styles.saveText, !dirty && styles.saveTextDisabled]}
              >
                Save
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.topRightButtons}>
              <TouchableOpacity
                onPress={handleGridToggle}
                style={styles.topIconButtonLarge}
              >
                <Text style={styles.topIconTextLarge}>⊞</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteDoc}
                style={styles.topIconButton}
              >
                <Text style={styles.topIconText}>🗑</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {renderContent()}

      {/* Bottom toolbar in non-edit mode (unchanged) */}
      {viewMode !== 'zoomed' && !editMode && (
        <View style={styles.toolbar}>
          <Tool
            icon={isExporting ? '⏳' : '📤'}
            label={isExporting ? 'Exporting...' : 'Export'}
            onPress={handleExport}
            primary
            disabled={isExporting}
          />
          <Tool icon="✏️" label="Edit" onPress={handleEditMode} />
          <Tool icon="📷" label="Add Page" onPress={handleAddPages} />
        </View>
      )}

      {/* NEW: Edit toolbar (Crop, Rotate, Filters, Delete) */}
      {editMode && (
        <View style={styles.editToolbar}>
          <EditTool icon="✂️" label="Crop" onPress={pressCrop} />
          <EditTool icon="↻" label="Rotate" onPress={pressRotate} />
          <EditTool icon="🎛️" label="Filters" onPress={pressFilters} />
          <EditTool
            icon="🗑"
            label="Delete"
            onPress={pressDeletePage}
            destructive
          />
        </View>
      )}

      {/* Crop Modal */}
      {currentPage && (
        <CropModal
          visible={cropModalVisible}
          page={currentPage}
          onCancel={() => setCropModalVisible(false)}
          onApply={(uri, width, height) => {
            if (onApplyCrop && currentPage) {
              onApplyCrop(doc.id, currentPage.id, uri, width, height);
            }
            setCropModalVisible(false);
            setDirty(false);
            setEditMode(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}

type ToolProps = {
  label: string;
  onPress: () => void;
  primary?: boolean;
  destructive?: boolean;
  icon?: string;
  disabled?: boolean;
};

function Tool({
  label,
  onPress,
  primary = false,
  destructive = false,
  icon,
  disabled = false,
}: ToolProps) {
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      style={[
        styles.tool,
        primary && styles.toolPrimary,
        destructive && styles.toolDestructive,
        disabled && styles.toolDisabled,
      ]}
      disabled={disabled}
    >
      {icon && <Text style={styles.toolIcon}>{icon}</Text>}
      <Text
        style={[
          styles.toolText,
          primary && styles.toolTextPrimary,
          destructive && styles.toolTextDestructive,
          disabled && styles.toolTextDisabled,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function EditTool({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.editTool, destructive && styles.editToolDestructive]}
    >
      <Text style={styles.editToolIcon}>{icon}</Text>
      <Text
        style={[
          styles.editToolLabel,
          destructive && styles.editToolLabelDestructive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F17' },

  // top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  backButton: { padding: 8 },
  backText: { color: '#8FB3FF', fontSize: 16, fontWeight: '700' },
  title: { color: '#E6EDF7', fontSize: 16, fontWeight: '800' },
  topRightButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topIconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  topIconButtonLarge: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  topIconText: { color: '#E6EDF7', fontSize: 18 },
  topIconTextLarge: { color: '#E6EDF7', fontSize: 22 },

  // viewers
  canvas: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  editCanvas: {
    flex: 1,
    alignItems: 'stretch', // IMPORTANT: stretch horizontally so child can use full width
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  pageCount: { color: '#ABBCCD', marginTop: 12 },

  // bottom toolbar (non-edit)
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E2633',
  },
  tool: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#10192B',
  },
  toolPrimary: { backgroundColor: '#2563EB' },
  toolDestructive: { backgroundColor: '#2B0F12' },
  toolText: { color: '#B6C2D9', fontWeight: '700' },
  toolTextPrimary: { color: '#FFF' },
  toolTextDestructive: { color: '#FF9AA7' },
  toolIcon: { fontSize: 20, marginBottom: 4, textAlign: 'center' },
  toolDisabled: { opacity: 0.5 },
  toolTextDisabled: { color: '#666' },

  // grid/zoomed (unchanged)
  gridContainer: { padding: 20, justifyContent: 'space-around' },
  gridItem: {
    margin: 10,
    backgroundColor: '#111',
    borderRadius: 8,
    overflow: 'hidden',
  },
  gridImage: { flex: 1, width: '100%' },
  pageLabel: {
    color: '#E6EDF7',
    textAlign: 'center',
    padding: 8,
    fontSize: 12,
    fontWeight: '600',
  },

  // NEW: edit toolbar
  editToolbar: {
    borderTopWidth: 1,
    borderTopColor: '#1E2633',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#0E1524',
  },
  editTool: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  editToolIcon: { fontSize: 20, marginBottom: 4, color: '#E6EDF7' },
  editToolLabel: { color: '#E6EDF7', fontSize: 12, fontWeight: '600' },
  editToolDestructive: {},
  editToolLabelDestructive: { color: '#FF9AA7' },
  saveBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnDisabled: { backgroundColor: '#374151' },
  saveText: { color: '#FFFFFF', fontWeight: '700' },
  saveTextDisabled: { color: '#A3A3A3' },
});
