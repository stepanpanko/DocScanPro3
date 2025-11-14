import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Image,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';

import type { Page } from '../types';

type Props = {
  page: Page;
  sourceUri?: string;
  rotation?: 0 | 90 | 180 | 270;
  mode?: 'zoom' | 'fit';
  onZoomChange?: (isZoomed: boolean) => void;
  /** NEW: available width provided by parent */
  containerWidth?: number;
  /** Enable pinch-to-zoom while keeping fit sizing (used by Fullscreen) */
  enablePinchInFit?: boolean;
};

export default function ZoomableImage({
  page,
  sourceUri,
  rotation,
  mode = 'zoom',
  onZoomChange,
  containerWidth,
  enablePinchInFit,
}: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView>(null);
  const [loading, setLoading] = useState(true);
  const [failedOnce, setFailedOnce] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  // Measured container size
  const [cw, setCw] = useState<number>(0);
  const [ch, setCh] = useState<number>(0);
  // Natural image size
  const [iw, setIw] = useState<number | null>(page?.width ?? null);
  const [ih, setIh] = useState<number | null>(page?.height ?? null);

  // Use sourceUri if provided, otherwise page.uri
  const rawUri = sourceUri ?? page.uri;

  // Normalize URI (keep ph:// if present; ensure file:// for file paths)
  const imageUri = !rawUri
    ? ''
    : rawUri.startsWith('ph://') || rawUri.startsWith('file://')
      ? rawUri
      : 'file://' + rawUri;

  if (__DEV__) {
    console.log('[ZoomableImage] Rendering:', {
      imageUri,
      sourceUri,
      pageUri: page.uri,
      rotation,
      mode,
    });
  }

  // Reset zoom when page changes
  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ x: 0, y: 0, animated: false });
    }
    setLoading(true);
  }, [imageUri]);

  const handleScroll = (event: any) => {
    const { contentSize, layoutMeasurement, zoomScale } = event.nativeEvent;
    // allow panning only if actually zoomed in
    const z = typeof zoomScale === 'number' ? zoomScale : 1;
    const isZoomed =
      z > 1.01 ||
      contentSize.width > layoutMeasurement.width ||
      contentSize.height > layoutMeasurement.height;
    setCanScroll(isZoomed);
    onZoomChange?.(isZoomed);
  };

  const handleLoad = () => {
    if (__DEV__) {
      console.log('[ZoomableImage] Image loaded successfully:', imageUri);
    }
    setLoading(false);
    setFailedOnce(false);
  };

  const handleError = (error: any) => {
    console.warn(
      '[ZoomableImage] Image load error:',
      error?.nativeEvent?.error || error,
    );
    console.warn('[ZoomableImage] Failed URI:', imageUri);
    setLoading(false);
    setFailedOnce(true);
  };

  // Use page.rotation if no explicit rotation is passed
  const appliedRotation = (rotation ?? page.rotation ?? 0) as
    | 0
    | 90
    | 180
    | 270;
  const angle = `${appliedRotation}deg`;

  // Measure container for fit math
  const onContainerLayout = (e: any) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== cw) setCw(width);
    if (height !== ch) setCh(height);
  };

  // Fetch natural image size if unknown
  useEffect(() => {
    if (!iw || !ih) {
      const uriToTry = failedOnce ? (sourceUri ?? page.uri) : imageUri;
      if (!uriToTry) return;
      Image.getSize(
        uriToTry,
        (w, h) => {
          setIw(w);
          setIh(h);
        },
        () => {},
      );
    }
  }, [imageUri, failedOnce, sourceUri, page.uri, iw, ih]);

  // ===== FIT MODE (used in Edit screen + Carousel) =====
  if (mode === 'fit') {
    // Base (unrotated) image size
    const baseW = iw ?? screenWidth;
    const baseH = ih ?? screenHeight;
    const isRotated = appliedRotation % 180 !== 0;

    // Measured container size (width+height). W can be given by parent, otherwise use measured cw.
    const W = (containerWidth ?? cw) || screenWidth;
    const H = ch || screenHeight; // << key: also clamp to container HEIGHT

    // Rotate-aware contain scale
    const rotW = isRotated ? baseH : baseW;
    const rotH = isRotated ? baseW : baseH;
    const scale = Math.min(W / rotW, H / rotH);

    // Final *visual* size
    const vW = rotW * scale;
    const vH = rotH * scale;

    // Pre-rotation layout size so that after rotate we get vW×vH
    const preW = isRotated ? vH : vW;
    const preH = isRotated ? vW : vH;

    // If pinch zoom is enabled for fit, wrap in ScrollView like zoom mode
    if (enablePinchInFit) {
      return (
        <View style={styles.fitContainer} onLayout={onContainerLayout}>
          {loading && !!imageUri && (
            <View style={styles.spinnerWrap}>
              <ActivityIndicator />
            </View>
          )}
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.contentContainerZoom}
            minimumZoomScale={1}
            maximumZoomScale={3}
            contentInsetAdjustmentBehavior="never"
            bounces={false}
            bouncesZoom={Platform.OS === 'ios'}
            alwaysBounceVertical={false}
            alwaysBounceHorizontal={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            directionalLockEnabled={true}
            scrollEnabled={canScroll}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {!!imageUri && !failedOnce && (
              <Image
                key={`${page.id}:${imageUri}:${appliedRotation}:fit-zoom`}
                source={{ uri: imageUri }}
                style={{
                  width: preW,
                  height: preH,
                  alignSelf: 'center',
                  transform: [{ rotate: angle }],
                }}
                resizeMode="contain"
                onLoad={handleLoad}
                onError={handleError}
              />
            )}
            {!!rawUri && failedOnce && (
              <Image
                key={`${page.id}:${rawUri}:${appliedRotation}:fit-zoom:fallback`}
                source={{ uri: rawUri }}
                style={{
                  width: preW,
                  height: preH,
                  alignSelf: 'center',
                  transform: [{ rotate: angle }],
                }}
                resizeMode="contain"
                onLoad={handleLoad}
                onError={() => {}}
              />
            )}
          </ScrollView>
        </View>
      );
    }

    // Default: non-zoomable fit (used in Edit canvas)
    return (
      <View style={styles.fitContainer} onLayout={onContainerLayout}>
        {loading && !!imageUri && (
          <View style={styles.spinnerWrap}>
            <ActivityIndicator />
          </View>
        )}

        {!!imageUri && !failedOnce && (
          <Image
            key={`${page.id}:${imageUri}:${appliedRotation}:fit`}
            source={{ uri: imageUri }}
            style={{
              width: preW,
              height: preH,
              alignSelf: 'center',
              transform: [{ rotate: angle }],
            }}
            resizeMode="contain"
            onLoad={handleLoad}
            onError={handleError}
          />
        )}

        {!!rawUri && failedOnce && (
          <Image
            key={`${page.id}:${rawUri}:${appliedRotation}:fit:fallback`}
            source={{ uri: rawUri }}
            style={{
              width: preW,
              height: preH,
              alignSelf: 'center',
              transform: [{ rotate: angle }],
            }}
            resizeMode="contain"
            onLoad={handleLoad}
            onError={() => {}}
          />
        )}
      </View>
    );
  }

  // Default zoom mode with ScrollView
  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.spinnerWrap}>
          <ActivityIndicator />
        </View>
      )}
      {!!imageUri && (
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainerZoom}
          minimumZoomScale={1}
          maximumZoomScale={3}
          contentInsetAdjustmentBehavior="never"
          bounces={false}
          bouncesZoom={Platform.OS === 'ios'}
          alwaysBounceVertical={false}
          alwaysBounceHorizontal={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          directionalLockEnabled={true}
          scrollEnabled={canScroll}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <Image
            source={{ uri: imageUri }}
            style={[
              {
                width: screenWidth,
                height: screenHeight,
                maxWidth: screenWidth,
                maxHeight: screenHeight,
              },
              { transform: [{ rotate: angle }] },
            ]}
            resizeMode="contain"
            onLoad={handleLoad}
            onError={handleError}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentContainerZoom: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  fitContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'stretch',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  spinnerWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
