import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  Dimensions,
  StyleSheet,
  Pressable,
  Modal,
} from 'react-native';

import type { Page } from '../types';

import FullscreenZoom from './FullscreenZoom';
import ZoomableImage from './ZoomableImage';

type Props = {
  pages: Page[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function PageCarousel({
  pages,
  initialIndex = 0,
  onIndexChange,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const listRef = useRef<FlatList<Page>>(null);

  const handleIndexChange = useCallback(
    (i: number) => {
      setCurrentIndex(i);
      onIndexChange?.(i);
    },
    [onIndexChange],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: screenWidth,
      offset: screenWidth * index,
      index,
    }),
    [],
  );

  const openFullscreen = useCallback(() => setIsFullscreen(true), []);
  const closeFullscreen = useCallback(() => setIsFullscreen(false), []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: any) => {
      if (viewableItems?.length > 0 && viewableItems[0].index != null) {
        const idx = viewableItems[0].index as number;
        if (idx !== currentIndex) handleIndexChange(idx);
      }
    },
    [currentIndex, handleIndexChange],
  );

  const viewabilityConfig = { itemVisiblePercentThreshold: 50 };

  if (!pages.length) return <View style={styles.empty} />;

  return (
    <>
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          data={pages}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={p => p.id}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          removeClippedSubviews
          windowSize={3}
          maxToRenderPerBatch={1}
          initialNumToRender={1}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <View style={styles.preview}>
                {/* Width/height-fit math lives inside ZoomableImage */}
                <ZoomableImage
                  page={item}
                  mode="fit"
                  containerWidth={screenWidth * 0.9}
                />
              </View>
              {/* Tap overlay for fullscreen, doesn't block horizontal swipes */}
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={openFullscreen}
                hitSlop={6}
              />
            </View>
          )}
        />
      </View>

      <Modal
        visible={isFullscreen}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={closeFullscreen}
      >
        {pages[currentIndex] ? (
          <FullscreenZoom
            page={pages[currentIndex]}
            onClose={closeFullscreen}
          />
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  empty: { flex: 1, backgroundColor: '#0B0F17' },
  // Reverted: same proportions/centering as your previous single view
  slide: {
    width: screenWidth,
    height: screenHeight - 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    width: '90%',
    height: '90%',
  },
});
