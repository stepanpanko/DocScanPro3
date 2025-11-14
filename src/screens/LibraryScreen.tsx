import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActionSheetIOS,
  Platform,
  UIManager,
  LayoutAnimation,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Button from '../components/Button';
import { importFromFiles, importFromPhotos } from '../import/upload';
import { RootStackParamList, Doc, Folder } from '../types';
import { defaultDocTitle } from '../utils/naming';
import { formatTimestamp } from '../utils/time';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

type ItemProps = {
  item: Doc;
  navigation: NavigationProp;
  onMore: (doc: Doc) => void;
};

type FolderItem = Folder | { id: null; name: string; createdAt: number };

type LibraryScreenProps = {
  docs: Doc[];
  folders: Folder[];
  onCreate: () => void;
  onImport: (doc: Doc) => void;
  onDelete: (id: string) => void;
  createFolder: (name: string) => Folder;
  renameFolder: (id: string, name: string) => void;
  moveDoc: (docId: string, folderId: string | null) => void;
  renameDoc: (docId: string, title: string) => void;
};

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function Chip({ label, selected, onPress, onLongPress }: ChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text
        style={[styles.chipText, selected && styles.chipTextSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Item({ item, navigation, onMore }: ItemProps) {
  return (
    <TouchableOpacity
      onPress={() =>
        navigation.navigate('EditDocument', {
          docId: item.id,
          startIndex: 0,
          title: item.title,
        })
      }
      style={styles.item}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.itemSubtitle}>
          {formatTimestamp(item.createdAt)}
        </Text>
      </View>
      <TouchableOpacity onPress={() => onMore(item)} style={styles.moreBtn}>
        <Text style={styles.moreDots}>•••</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function LibraryScreen({
  docs,
  folders,
  onCreate,
  onImport,
  onDelete,
  createFolder,
  renameFolder,
  moveDoc,
  renameDoc,
}: LibraryScreenProps) {
  const navigation = useNavigation() as NavigationProp;
  const insets = useSafeAreaInsets();
  const listRef = useRef<any>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [rename, setRename] = useState<{
    open: boolean;
    id: string | null;
    text: string;
  }>({ open: false, id: null, text: '' });
  const [version, setVersion] = useState(0);

  const filteredDocs = useMemo(() => {
    console.log('[FOLDER] Selected folder ID:', selectedFolderId);
    console.log('[FOLDER] Total docs:', docs.length);
    console.log(
      '[FOLDER] Docs with folderId:',
      docs.map(d => ({ id: d.id, title: d.title, folderId: d.folderId })),
    );

    if (selectedFolderId === null) {
      // Show all documents when "All" is selected
      console.log('[FOLDER] Showing all documents');
      return docs;
    } else {
      // Show only documents in the selected folder
      const filtered = docs.filter(d => d.folderId === selectedFolderId);
      console.log(
        '[FOLDER] Filtered docs for folder',
        selectedFolderId,
        ':',
        filtered.length,
      );
      return filtered;
    }
  }, [docs, selectedFolderId]);

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    setVersion(v => v + 1);
  }, [docs.length]);

  const handleUpload = useCallback(() => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Import from Files', 'Import from Photos', 'Cancel'],
        cancelButtonIndex: 2,
        title: 'Import Documents',
      },
      async idx => {
        if (idx === 0) {
          const doc = await importFromFiles();
          if (doc) {
            if (!doc.title) doc.title = defaultDocTitle(doc.createdAt);
            onImport(doc);
          }
        } else if (idx === 1) {
          const doc = await importFromPhotos();
          if (doc) {
            if (!doc.title) doc.title = defaultDocTitle(doc.createdAt);
            onImport(doc);
          }
        }
      },
    );
  }, [onImport]);

  const showDocMenu = useCallback(
    (doc: Doc) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Rename…', 'Move to folder…', 'Delete', 'Cancel'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 3,
          title: doc.title,
        },
        idx => {
          if (idx === 0) {
            setRename({ open: true, id: doc.id, text: doc.title });
          } else if (idx === 1) {
            const names = [
              'All (no folder)',
              ...folders.map(f => f.name),
              'New folder…',
              'Cancel',
            ];
            ActionSheetIOS.showActionSheetWithOptions(
              {
                options: names,
                cancelButtonIndex: names.length - 1,
              },
              i => {
                if (i === 0) moveDoc(doc.id, null);
                else if (i === names.length - 2) {
                  Alert.prompt('New Folder', 'Name', text => {
                    const trimmed = text?.trim();
                    if (!trimmed) return;
                    const f = createFolder(trimmed);
                    moveDoc(doc.id, f.id);
                  });
                } else if (i > 0 && i < names.length - 2) {
                  const prev = folders[i - 1];
                  if (prev) moveDoc(doc.id, prev.id);
                }
              },
            );
          } else if (idx === 2) {
            Alert.alert('Delete', `Delete "${doc.title}"?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => onDelete(doc.id),
              },
            ]);
          }
        },
      );
    },
    [folders, moveDoc, onDelete, createFolder],
  );

  const renderItem = useCallback(
    ({ item }: { item: Doc }) => (
      <Item item={item} navigation={navigation} onMore={showDocMenu} />
    ),
    [navigation, showDocMenu],
  );

  const handleFolderLongPress = useCallback(
    (folder: FolderItem) => {
      if (!folder.id) return;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Rename folder…', 'Delete folder', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
          title: folder.name,
        },
        idx => {
          if (idx === 0) {
            Alert.prompt(
              'Rename Folder',
              '',
              text => {
                const trimmed = text?.trim();
                if (trimmed) renameFolder(folder.id, trimmed);
              },
              'plain-text',
              folder.name,
            );
          } else if (idx === 1) {
            Alert.alert('Delete folder', 'Docs will remain in “All”.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => renameFolder(folder.id, '__DELETE__'),
              },
            ]);
          }
        },
      );
    },
    [renameFolder],
  );

  return (
    <View style={styles.container}>
      <View
        style={[styles.header, { paddingTop: Math.max(insets.top + 8, 24) }]}
      >
        <Text style={styles.title}>DocScan Pro</Text>
        <View style={styles.headerButtons}>
          <Button label="+ Upload" onPress={handleUpload} variant="secondary" />
          <Button label="New Scan" onPress={onCreate} variant="primary" />
        </View>
      </View>

      <View style={styles.folderRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: null, name: 'All', createdAt: 0 }, ...folders]}
          keyExtractor={f => String(f.id)}
          contentContainerStyle={{ paddingHorizontal: 12 }}
          renderItem={({ item }) => (
            <Chip
              label={item.name}
              selected={selectedFolderId === item.id}
              onPress={() =>
                setSelectedFolderId(item.id === null ? null : item.id)
              }
              onLongPress={() => handleFolderLongPress(item)}
            />
          )}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.addChip}
              onPress={() =>
                Alert.prompt('New Folder', 'Name', text => {
                  const trimmed = text?.trim();
                  if (trimmed) {
                    const f = createFolder(trimmed);
                    setSelectedFolderId(f.id);
                  }
                })
              }
            >
              <Text style={styles.addChipText}>+ New Folder</Text>
            </TouchableOpacity>
          }
        />
      </View>

      <FlashList
        ref={listRef}
        data={filteredDocs}
        extraData={{ count: filteredDocs.length, version, selectedFolderId }}
        renderItem={renderItem}
        keyExtractor={d => String(d.id)}
        ListEmptyComponent={<Text style={styles.emptyText}>No documents.</Text>}
      />

      <Modal
        transparent
        visible={rename.open}
        animationType="fade"
        onRequestClose={() => setRename({ open: false, id: null, text: '' })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Rename Document</Text>
            <TextInput
              value={rename.text}
              autoFocus
              onChangeText={text => setRename(prev => ({ ...prev, text }))}
              style={styles.input}
              placeholder="Untitled"
              returnKeyType="done"
              onSubmitEditing={() => {
                const trimmed = rename.text.trim();
                if (trimmed && rename.id) renameDoc(rename.id, trimmed);
                setRename({ open: false, id: null, text: '' });
              }}
            />
            <View style={styles.modalRow}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setRename({ open: false, id: null, text: '' })}
              />
              <Button
                label="Save"
                variant="primary"
                onPress={() => {
                  const trimmed = rename.text.trim();
                  if (trimmed && rename.id) renameDoc(rename.id, trimmed);
                  setRename({ open: false, id: null, text: '' });
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F17' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1E2633',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#E6EDF7' },
  headerButtons: { flexDirection: 'row', gap: 12, marginTop: 12 },
  folderRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1E2633',
  },
  chip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#121929',
    marginRight: 8,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: '#2563eb22',
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  chipText: { color: '#B6C2D9', fontWeight: '600' },
  chipTextSelected: { color: '#E6EDF7' },
  addChip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#233146',
  },
  addChipText: { color: '#8FB3FF', fontWeight: '700' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 6,
    backgroundColor: '#0E1524',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2B41',
  },
  itemTitle: { color: '#E6EDF7', fontWeight: '700', fontSize: 16 },
  itemSubtitle: { color: '#7D8CA6', marginTop: 2, fontSize: 13 },
  moreBtn: { paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'center' },
  moreDots: { color: '#8FB3FF', fontSize: 18 },
  emptyText: {
    textAlign: 'center',
    color: '#7D8CA6',
    marginTop: 48,
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#0008',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSheet: {
    width: '86%',
    backgroundColor: '#0E1524',
    borderRadius: 16,
    padding: 16,
    borderColor: '#1F2B41',
    borderWidth: 1,
  },
  modalTitle: {
    color: '#E6EDF7',
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 8,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#0B1220',
    color: '#E6EDF7',
    borderWidth: 1,
    borderColor: '#1F2B41',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
});
