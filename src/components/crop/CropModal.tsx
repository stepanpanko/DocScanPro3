import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Image,
  Text,
  TouchableOpacity,
  NativeModules,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  detectQuad,
  cropPerspective,
  type NormalizedQuad,
  type Point,
} from '../../native/perspectiveCropper';
import type { Page } from '../../types';
import { getContainRect, polygonArea, type Rect } from '../../utils/contain';
import { getImageDimensions } from '../../utils/images';

import QuadCropOverlay from './QuadCropOverlay';

console.log('[Crop] Native available?', !!NativeModules.PerspectiveCropper);

type CropModalProps = {
  visible: boolean;
  page: Page;
  onCancel: () => void;
  onApply: (uri: string, width: number, height: number) => void;
};

export default function CropModal({
  visible,
  page,
  onCancel,
  onApply,
}: CropModalProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [quadNorm, setQuadNorm] = useState<NormalizedQuad | null>(null);
  const [imgW, setImgW] = useState<number>(0);
  const [imgH, setImgH] = useState<number>(0);
  const [imageRect, setImageRect] = useState<Rect>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [initialQuad, setInitialQuad] = useState<NormalizedQuad | null>(null);
  const [applying, setApplying] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Initialize: detect quad or use full bounds
  useEffect(() => {
    if (!visible || !page.uri) return;

    const initialize = async () => {
      setLoading(true);
      setDirty(false); // Reset dirty when modal opens
      try {
        // Get image dimensions
        const dims =
          page.width && page.height
            ? { width: page.width, height: page.height }
            : await getImageDimensions(page.uri);

        setImgW(dims.width);
        setImgH(dims.height);

        // Try to detect quad
        try {
          const result = await detectQuad(page.uri);
          if (result.quadNorm) {
            setQuadNorm(result.quadNorm);
            setInitialQuad(result.quadNorm);
          } else {
            // No detection - use full image bounds
            const fullQuad: NormalizedQuad = {
              tl: { x: 0, y: 0 },
              tr: { x: 1, y: 0 },
              br: { x: 1, y: 1 },
              bl: { x: 0, y: 1 },
            };
            setQuadNorm(fullQuad);
            setInitialQuad(fullQuad);
          }
        } catch (error) {
          // Detection failed - use full bounds
          console.warn(
            '[CropModal] Detection failed, using full bounds:',
            error,
          );
          const fullQuad: NormalizedQuad = {
            tl: { x: 0, y: 0 },
            tr: { x: 1, y: 0 },
            br: { x: 1, y: 1 },
            bl: { x: 0, y: 1 },
          };
          setQuadNorm(fullQuad);
          setInitialQuad(fullQuad);
        }
      } catch (error) {
        console.error('[CropModal] Initialization failed:', error);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [visible, page.uri, page.width, page.height]);

  // Calculate image rect when container is laid out
  const onImageLayout = useCallback(
    (event: any) => {
      const { width, height } = event.nativeEvent.layout;
      const rect = getContainRect(imgW, imgH, width, height);
      setImageRect(rect);
    },
    [imgW, imgH],
  );

  // Check if quad is valid (area > 2% and all edges >= min length)
  const invalidQuad = useMemo(() => {
    if (!quadNorm) return true;

    // --- 1) Area check (use normalized coords) ---
    // polygonArea() returns area in the same unit as the inputs.
    // Our quad points are normalized [0..1], so this is already a ratio of image area.
    const points: Point[] = [
      quadNorm.tl,
      quadNorm.tr,
      quadNorm.br,
      quadNorm.bl,
    ];
    const areaNorm = polygonArea(points);
    if (!Number.isFinite(areaNorm) || areaNorm < 0.02) return true; // require at least 2% of the image

    // --- 2) Edge-length check (in pixels) ---
    if (imgW === 0 || imgH === 0) return true;
    const edges: Array<[Point, Point]> = [
      [quadNorm.tl, quadNorm.tr],
      [quadNorm.tr, quadNorm.br],
      [quadNorm.br, quadNorm.bl],
      [quadNorm.bl, quadNorm.tl],
    ];
    const minEdgePx = Math.min(imgW, imgH) * 0.04; // 4% of the smaller dimension
    for (const [p1, p2] of edges) {
      const dx = (p2.x - p1.x) * imgW;
      const dy = (p2.y - p1.y) * imgH;
      const edgeLen = Math.hypot(dx, dy);
      if (edgeLen < minEdgePx) return true;
    }

    return false;
  }, [quadNorm, imgW, imgH]);

  const handleApply = async () => {
    if (!quadNorm || !page.uri || imgW === 0 || imgH === 0 || invalidQuad) {
      return;
    }

    setApplying(true);
    try {
      const result = await cropPerspective(page.uri, imgW, imgH, quadNorm);
      setDirty(false); // Reset dirty on successful apply
      onApply(result.uri, result.width, result.height);
    } catch (error) {
      console.error('[CropModal] Apply failed:', error);
      // TODO: show error alert
    } finally {
      setApplying(false);
    }
  };

  const handleCancel = () => {
    setDirty(false); // Reset dirty on cancel
    onCancel();
  };

  // Extract snap lines from detected quad (if available)
  const snapLines = initialQuad
    ? [
        { p1: initialQuad.tl, p2: initialQuad.tr },
        { p1: initialQuad.tr, p2: initialQuad.br },
        { p1: initialQuad.br, p2: initialQuad.bl },
        { p1: initialQuad.bl, p2: initialQuad.tl },
      ]
    : [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={['bottom']}>
          {/* Header in normal flow */}
          <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              onPress={handleCancel}
              hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
              style={styles.navBtn}
            >
              <Text style={styles.navBack}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={styles.navTitle}>Crop</Text>
            <TouchableOpacity
              onPress={handleApply}
              disabled={
                applying || loading || !quadNorm || invalidQuad || !dirty
              }
              hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
              style={styles.navBtn}
            >
              <Text
                style={[
                  styles.navSave,
                  (applying ||
                    loading ||
                    !quadNorm ||
                    invalidQuad ||
                    !dirty) && {
                    opacity: 0.5,
                  },
                ]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>

          {/* Image preview with overlay */}
          <View style={styles.previewContainer} onLayout={onImageLayout}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#8FB3FF" />
                <Text style={styles.loadingText}>Detecting document...</Text>
              </View>
            ) : (
              <>
                <Image
                  source={{ uri: page.uri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                />
                {quadNorm && imageRect.width > 0 && (
                  <QuadCropOverlay
                    imageRect={imageRect}
                    quadNorm={quadNorm}
                    onChange={setQuadNorm}
                    snapLines={snapLines}
                    enabled={!applying}
                    _imgW={imgW}
                    _imgH={imgH}
                    onDirty={() => setDirty(true)}
                  />
                )}
              </>
            )}
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nav: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(11,15,23,0.85)',
  },
  navBtn: {
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  navBack: {
    color: '#8FB3FF',
    fontSize: 16,
    fontWeight: '700',
  },
  navTitle: {
    color: '#E6EDF7',
    fontSize: 16,
    fontWeight: '800',
  },
  navSave: {
    color: '#8FB3FF',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#E6EDF7',
    marginTop: 12,
    fontSize: 14,
  },
});
