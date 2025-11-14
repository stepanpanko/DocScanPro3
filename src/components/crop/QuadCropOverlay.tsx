import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  runOnJS,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { NormalizedQuad, Point } from '../../native/perspectiveCropper';
import {
  mapNormToPreview,
  mapPreviewToNorm,
  clampNormPoint,
  distance,
  projectToLineSegment,
  type Rect,
} from '../../utils/contain';

// Visual vs touch target
const HANDLE_VISUAL_RADIUS = 10; // 20px dot
const TOUCH_TARGET = 50; // concrete touch target size
const TARGET_HALF = TOUCH_TARGET / 2;
const HANDLE_HITSLOP_PX = 12; // modest cushion
const MIN_DRAG_START_PX = 0; // ignore micro jitters
const SNAP_THRESHOLD_PX = 0; // keep off for now
const MIN_EDGE_LEN_NORM = 0.01; // gentler; or enforce only onEnd as above
const DAMPING = 1; // slower mapping finger→handle

const HANDLE_DIAMETER = HANDLE_VISUAL_RADIUS * 2;

// Helper to clamp a preview point to the imageRect (worklet-safe)
const clampPreviewToImage = (p: { x: number; y: number }, r: Rect) => {
  'worklet';
  return {
    x: Math.max(r.x, Math.min(r.x + r.width, p.x)),
    y: Math.max(r.y, Math.min(r.y + r.height, p.y)),
  };
};

type QuadCropOverlayProps = {
  imageRect: Rect;
  quadNorm: NormalizedQuad;
  onChange: (quadNorm: NormalizedQuad) => void;
  snapLines?: Array<{ p1: Point; p2: Point }>;
  enabled?: boolean;
  _imgW: number;
  _imgH: number;
  onDirty?: () => void;
};

export default function QuadCropOverlay({
  imageRect,
  quadNorm,
  onChange,
  snapLines = [],
  enabled = true,
  _imgW: _imgW,
  _imgH: _imgH,
  onDirty,
}: QuadCropOverlayProps) {
  const startQuad = useSharedValue<NormalizedQuad>(quadNorm);
  const currentQuad = useSharedValue<NormalizedQuad>(quadNorm);
  const active = useSharedValue<
    'tl' | 'tr' | 'br' | 'bl' | 'tm' | 'rm' | 'bm' | 'lm' | null
  >(null);
  const sentDirty = useSharedValue(false);

  // Update shared value when quad changes from outside
  React.useEffect(() => {
    startQuad.value = quadNorm;
    currentQuad.value = quadNorm;
    sentDirty.value = false;
  }, [quadNorm, startQuad, currentQuad, sentDirty]);

  const constrainQuad = (q: NormalizedQuad): NormalizedQuad => {
    'worklet';
    const pairs: Array<['tl' | 'tr' | 'br' | 'bl', 'tl' | 'tr' | 'br' | 'bl']> =
      [
        ['tl', 'tr'],
        ['tr', 'br'],
        ['br', 'bl'],
        ['bl', 'tl'],
      ];
    for (const [a, b] of pairs) {
      const dx = q[a].x - q[b].x;
      const dy = q[a].y - q[b].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < MIN_EDGE_LEN_NORM) {
        const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        const nx = (dx / len) * (MIN_EDGE_LEN_NORM - d) * 0.5;
        const ny = (dy / len) * (MIN_EDGE_LEN_NORM - d) * 0.5;
        q[a] = clampNormPoint({ x: q[a].x + nx, y: q[a].y + ny });
        q[b] = clampNormPoint({ x: q[b].x - nx, y: q[b].y - ny });
      }
    }
    return {
      tl: clampNormPoint(q.tl),
      tr: clampNormPoint(q.tr),
      br: clampNormPoint(q.br),
      bl: clampNormPoint(q.bl),
    };
  };

  const createCornerGesture = useCallback(
    (corner: 'tl' | 'tr' | 'br' | 'bl') => {
      return Gesture.Pan()
        .enabled(enabled)
        .maxPointers(1)
        .hitSlop(HANDLE_HITSLOP_PX)
        .minDistance(MIN_DRAG_START_PX)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          'worklet';
          // Own the drag exclusively
          if (active.value && active.value !== corner) return;
          active.value = corner;
          startQuad.value = { ...currentQuad.value };
          sentDirty.value = false;
          if (!sentDirty.value && onDirty) {
            sentDirty.value = true;
            runOnJS(onDirty)();
          }
        })
        .onUpdate(e => {
          'worklet';
          if (active.value !== corner) return;

          // On first update, mark as dirty
          if (!sentDirty.value && onDirty) {
            sentDirty.value = true;
            runOnJS(onDirty)();
          }

          // Use START corner, not current (prevents compounding)
          const startPrev = mapNormToPreview(
            startQuad.value[corner],
            imageRect,
          );
          const moved = {
            x: startPrev.x + e.translationX * DAMPING,
            y: startPrev.y + e.translationY * DAMPING,
          };

          // optional snap
          let snapped = clampPreviewToImage(moved, imageRect);
          for (let i = 0; i < snapLines.length; i++) {
            const line = snapLines[i];
            if (!line) continue;
            const s1 = mapNormToPreview(line.p1, imageRect);
            const s2 = mapNormToPreview(line.p2, imageRect);
            const proj = projectToLineSegment(moved, s1, s2);
            if (
              proj.withinBounds &&
              distance(moved, proj.point) < SNAP_THRESHOLD_PX
            ) {
              snapped = proj.point;
              break;
            }
          }

          const nx = clampNormPoint(mapPreviewToNorm(snapped, imageRect));
          // No constraint during drag -> no "pushes other pins"
          currentQuad.value = {
            ...startQuad.value,
            [corner]: nx,
          } as NormalizedQuad;
        })
        .onEnd(() => {
          'worklet';
          // Apply constraints once, at the end
          currentQuad.value = constrainQuad(currentQuad.value);
          active.value = null;
          runOnJS(onChange)(currentQuad.value);
        });
    },
    [
      enabled,
      imageRect,
      snapLines,
      startQuad,
      currentQuad,
      onChange,
      active,
      onDirty,
      sentDirty,
    ],
  );

  const createMidEdgeGesture = useCallback(
    (edge: 'tm' | 'rm' | 'bm' | 'lm') => {
      return Gesture.Pan()
        .enabled(enabled)
        .maxPointers(1)
        .hitSlop(HANDLE_HITSLOP_PX)
        .minDistance(MIN_DRAG_START_PX)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          'worklet';
          if (active.value && active.value !== edge) return;
          active.value = edge;
          startQuad.value = { ...currentQuad.value };
          sentDirty.value = false;
          if (!sentDirty.value && onDirty) {
            sentDirty.value = true;
            runOnJS(onDirty)();
          }
        })
        .onUpdate(e => {
          'worklet';
          if (active.value !== edge) return;

          // On first update, mark as dirty
          if (!sentDirty.value && onDirty) {
            sentDirty.value = true;
            runOnJS(onDirty)();
          }

          const corners: [keyof NormalizedQuad, keyof NormalizedQuad] =
            edge === 'tm'
              ? ['tl', 'tr']
              : edge === 'rm'
                ? ['tr', 'br']
                : edge === 'bm'
                  ? ['bl', 'br']
                  : ['tl', 'bl'];

          const [a, b] = corners;
          const aStartPrev = mapNormToPreview(startQuad.value[a], imageRect);
          const bStartPrev = mapNormToPreview(startQuad.value[b], imageRect);
          const midStartPrev = {
            x: (aStartPrev.x + bStartPrev.x) / 2,
            y: (aStartPrev.y + bStartPrev.y) / 2,
          };

          const movedMid = clampPreviewToImage(
            {
              x: midStartPrev.x + e.translationX * DAMPING,
              y: midStartPrev.y + e.translationY * DAMPING,
            },
            imageRect,
          );

          const midNorm = clampNormPoint(mapPreviewToNorm(movedMid, imageRect));
          const dx =
            midNorm.x - (startQuad.value[a].x + startQuad.value[b].x) / 2;
          const dy =
            midNorm.y - (startQuad.value[a].y + startQuad.value[b].y) / 2;

          currentQuad.value = {
            ...startQuad.value,
            [a]: clampNormPoint({
              x: startQuad.value[a].x + dx,
              y: startQuad.value[a].y + dy,
            }),
            [b]: clampNormPoint({
              x: startQuad.value[b].x + dx,
              y: startQuad.value[b].y + dy,
            }),
          } as NormalizedQuad;
        })
        .onEnd(() => {
          'worklet';
          currentQuad.value = constrainQuad(currentQuad.value);
          active.value = null;
          runOnJS(onChange)(currentQuad.value);
        });
    },
    [
      enabled,
      imageRect,
      startQuad,
      currentQuad,
      onChange,
      active,
      onDirty,
      sentDirty,
    ],
  );

  // Animated styles for corner handles
  const tlStyle = useAnimatedStyle(() => {
    'worklet';
    const p = mapNormToPreview(currentQuad.value.tl, imageRect);
    return {
      left: p.x - TARGET_HALF,
      top: p.y - TARGET_HALF,
    };
  });

  const trStyle = useAnimatedStyle(() => {
    'worklet';
    const p = mapNormToPreview(currentQuad.value.tr, imageRect);
    return {
      left: p.x - TARGET_HALF,
      top: p.y - TARGET_HALF,
    };
  });

  const brStyle = useAnimatedStyle(() => {
    'worklet';
    const p = mapNormToPreview(currentQuad.value.br, imageRect);
    return {
      left: p.x - TARGET_HALF,
      top: p.y - TARGET_HALF,
    };
  });

  const blStyle = useAnimatedStyle(() => {
    'worklet';
    const p = mapNormToPreview(currentQuad.value.bl, imageRect);
    return {
      left: p.x - TARGET_HALF,
      top: p.y - TARGET_HALF,
    };
  });

  // Animated styles for mid-edge handles
  const tmStyle = useAnimatedStyle(() => {
    'worklet';
    const p1 = mapNormToPreview(currentQuad.value.tl, imageRect);
    const p2 = mapNormToPreview(currentQuad.value.tr, imageRect);
    const p = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return {
      left: p.x - TARGET_HALF,
      top: p.y - TARGET_HALF,
    };
  });

  const rmStyle = useAnimatedStyle(() => {
    'worklet';
    const p1 = mapNormToPreview(currentQuad.value.tr, imageRect);
    const p2 = mapNormToPreview(currentQuad.value.br, imageRect);
    const p = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return {
      left: p.x - TARGET_HALF,
      top: p.y - TARGET_HALF,
    };
  });

  const bmStyle = useAnimatedStyle(() => {
    'worklet';
    const p1 = mapNormToPreview(currentQuad.value.bl, imageRect);
    const p2 = mapNormToPreview(currentQuad.value.br, imageRect);
    const p = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return {
      left: p.x - TARGET_HALF,
      top: p.y - TARGET_HALF,
    };
  });

  const lmStyle = useAnimatedStyle(() => {
    'worklet';
    const p1 = mapNormToPreview(currentQuad.value.tl, imageRect);
    const p2 = mapNormToPreview(currentQuad.value.bl, imageRect);
    const p = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return {
      left: p.x - TARGET_HALF,
      top: p.y - TARGET_HALF,
    };
  });

  // Animated styles for edges
  const topEdgeStyle = useAnimatedStyle(() => {
    'worklet';
    const p1 = mapNormToPreview(currentQuad.value.tl, imageRect);
    const p2 = mapNormToPreview(currentQuad.value.tr, imageRect);
    const w = distance(p1, p2);
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    return {
      left: p1.x,
      top: p1.y,
      width: w,
      transform: [{ rotate: `${ang}rad` }],
    };
  });

  const rightEdgeStyle = useAnimatedStyle(() => {
    'worklet';
    const p1 = mapNormToPreview(currentQuad.value.tr, imageRect);
    const p2 = mapNormToPreview(currentQuad.value.br, imageRect);
    const w = distance(p1, p2);
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    return {
      left: p1.x,
      top: p1.y,
      width: w,
      transform: [{ rotate: `${ang}rad` }],
    };
  });

  const bottomEdgeStyle = useAnimatedStyle(() => {
    'worklet';
    const p1 = mapNormToPreview(currentQuad.value.br, imageRect);
    const p2 = mapNormToPreview(currentQuad.value.bl, imageRect);
    const w = distance(p1, p2);
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    return {
      left: p1.x,
      top: p1.y,
      width: w,
      transform: [{ rotate: `${ang}rad` }],
    };
  });

  const leftEdgeStyle = useAnimatedStyle(() => {
    'worklet';
    const p1 = mapNormToPreview(currentQuad.value.bl, imageRect);
    const p2 = mapNormToPreview(currentQuad.value.tl, imageRect);
    const w = distance(p1, p2);
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    return {
      left: p1.x,
      top: p1.y,
      width: w,
      transform: [{ rotate: `${ang}rad` }],
    };
  });

  const renderCornerHandle = useCallback(
    (corner: 'tl' | 'tr' | 'br' | 'bl', style: any) => {
      const gesture = createCornerGesture(corner);
      return (
        <GestureDetector gesture={gesture} key={corner}>
          <Animated.View style={[styles.touchTarget, style]}>
            <View pointerEvents="none" style={styles.handleDot} />
          </Animated.View>
        </GestureDetector>
      );
    },
    [createCornerGesture],
  );

  const renderMidHandle = useCallback(
    (edge: 'tm' | 'rm' | 'bm' | 'lm', style: any) => {
      const gesture = createMidEdgeGesture(edge);
      return (
        <GestureDetector gesture={gesture} key={edge}>
          <Animated.View style={[styles.touchTarget, style]}>
            <View pointerEvents="none" style={styles.handleDot} />
          </Animated.View>
        </GestureDetector>
      );
    },
    [createMidEdgeGesture],
  );

  // Simple quad outline using lines
  return (
    <View
      style={styles.container}
      pointerEvents={enabled ? 'box-none' : 'none'}
    >
      {/* Semi-transparent overlay */}
      <View style={styles.maskOverlay} pointerEvents="none" />

      {/* Quad outline - simplified to 4 lines */}
      <View style={styles.quadOutline}>
        <Animated.View style={[styles.edge, topEdgeStyle]} />
        <Animated.View style={[styles.edge, rightEdgeStyle]} />
        <Animated.View style={[styles.edge, bottomEdgeStyle]} />
        <Animated.View style={[styles.edge, leftEdgeStyle]} />
      </View>

      {/* Corner handles */}
      {renderCornerHandle('tl', tlStyle)}
      {renderCornerHandle('tr', trStyle)}
      {renderCornerHandle('br', brStyle)}
      {renderCornerHandle('bl', blStyle)}

      {/* Mid-edge handles */}
      {renderMidHandle('tm', tmStyle)}
      {renderMidHandle('rm', rmStyle)}
      {renderMidHandle('bm', bmStyle)}
      {renderMidHandle('lm', lmStyle)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  maskOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  quadOutline: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  edge: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#8FB3FF',
    transformOrigin: 'left center',
  },
  touchTarget: {
    position: 'absolute',
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TARGET_HALF,
  },
  handleDot: {
    position: 'absolute',
    left: TARGET_HALF - HANDLE_VISUAL_RADIUS,
    top: TARGET_HALF - HANDLE_VISUAL_RADIUS,
    width: HANDLE_DIAMETER,
    height: HANDLE_DIAMETER,
    borderRadius: HANDLE_VISUAL_RADIUS,
    backgroundColor: '#8FB3FF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
