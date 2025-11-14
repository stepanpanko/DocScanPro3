// components/EditImage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';

type Props = {
  uri: string; // raw page.uri
  rotation: 0 | 90 | 180 | 270;
  width?: number; // optional page.width
  height?: number; // optional page.height
};

export default function EditImage({ uri, rotation, width, height }: Props) {
  const [tryRaw, setTryRaw] = useState(false);
  const [loading, setLoading] = useState(true);

  // Normalize once; if that fails, try raw
  const normalized = useMemo(
    () =>
      uri?.startsWith('ph://') || uri?.startsWith('file://')
        ? uri
        : `file://${uri}`,
    [uri],
  );
  const sourceUri = tryRaw ? uri : normalized;

  // Compute aspect ratio that respects rotation
  const aspect =
    width && height
      ? rotation === 90 || rotation === 270
        ? height / width
        : width / height
      : undefined; // fall back to contain without explicit AR

  useEffect(() => {
    setTryRaw(false);
    setLoading(true);
  }, [uri, rotation]);

  return (
    <View style={styles.container}>
      {loading && !!sourceUri && (
        <View style={styles.spinner}>
          <ActivityIndicator />
        </View>
      )}
      {!!sourceUri && (
        <Image
          source={{ uri: sourceUri }}
          resizeMode="contain" // never crop
          onLoad={() => setLoading(false)}
          onError={() => {
            // first try normalized; if it fails, try raw once
            if (!tryRaw) setTryRaw(true);
            else setLoading(false);
          }}
          style={[
            styles.image,
            // use aspectRatio when we know it; otherwise fill container with contain
            aspect
              ? { width: '100%', height: undefined, aspectRatio: aspect }
              : { width: '100%', height: '100%' },
            { transform: [{ rotate: `${rotation}deg` }] },
          ]}
        />
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
  image: {},
  spinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
