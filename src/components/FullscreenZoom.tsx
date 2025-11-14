import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Page } from '../types';

import ZoomableImage from './ZoomableImage';

const { width: screenWidth } = Dimensions.get('window');

type Props = {
  page: Page;
  onClose: () => void;
};

export default function FullscreenZoom({ page, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const fallbackTop =
    Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight ?? 24);
  const topPad = insets.top && insets.top > 0 ? insets.top : fallbackTop;
  const [w, setW] = useState<number | undefined>(undefined);

  return (
    <View style={styles.root} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <View
        pointerEvents="box-none"
        style={[styles.overlay, { paddingTop: topPad }]}
      >
        <TouchableOpacity
          onPress={onClose}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 20 }}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
      </View>

      {/* Same geometry as Edit: mode="fit" + measured container width */}
      <ZoomableImage
        key={`${page.id}:${page.uri}:${page.rotation}:${w ?? 'auto'}`}
        page={page}
        mode="fit"
        containerWidth={w ?? screenWidth}
        enablePinchInFit
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0F17' },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100, // ensure above ScrollView
    paddingHorizontal: 12,
    // paddingTop is added dynamically
  },

  backBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
