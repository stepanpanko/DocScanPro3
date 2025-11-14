import React from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';

import type { Page } from '../types';

type Props = {
  pages: Page[];
  currentIndex: number;
  onPageSelect: (index: number) => void;
};

const THUMBNAIL_SIZE = 60;
const THUMBNAIL_MARGIN = 8;

export default function ThumbnailStrip({
  pages,
  currentIndex,
  onPageSelect,
}: Props) {
  const flatListRef = React.useRef<FlatList>(null);

  // Scroll to current index when it changes
  React.useEffect(() => {
    if (flatListRef.current && currentIndex >= 0) {
      flatListRef.current.scrollToIndex({
        index: currentIndex,
        animated: true,
        viewPosition: 0.5, // Center the selected thumbnail
      });
    }
  }, [currentIndex]);

  const renderThumbnail = ({ item, index }: { item: Page; index: number }) => {
    const isActive = index === currentIndex;

    return (
      <TouchableOpacity
        style={[styles.thumbnailContainer, isActive && styles.activeThumbnail]}
        onPress={() => onPageSelect(index)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: item.uri }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
        {isActive && <View style={styles.activeIndicator} />}
      </TouchableOpacity>
    );
  };

  const getItemLayout = (data: any, index: number) => ({
    length: THUMBNAIL_SIZE + THUMBNAIL_MARGIN * 2,
    offset: (THUMBNAIL_SIZE + THUMBNAIL_MARGIN * 2) * index,
    index,
  });

  if (pages.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={pages}
        renderItem={renderThumbnail}
        keyExtractor={(item, index) => `${item.uri}-${index}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
        getItemLayout={getItemLayout}
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: THUMBNAIL_SIZE + THUMBNAIL_MARGIN * 2,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  contentContainer: {
    paddingHorizontal: THUMBNAIL_MARGIN,
    alignItems: 'center',
  },
  thumbnailContainer: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    marginHorizontal: THUMBNAIL_MARGIN,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  activeThumbnail: {
    borderColor: '#2563EB',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  activeIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#000',
  },
});
