import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import type { Doc } from '../../types';

type Props = {
  doc: Doc;
};

export default function SearchableStatus({ doc }: Props) {
  // Only show when OCR is done and we have searchable text
  if (doc.ocrStatus !== 'done' || !doc.ocrPages || doc.ocrPages.length === 0) {
    return null;
  }

  const hasSearchableText = doc.ocrPages.some(
    page => page.fullText.trim().length > 0,
  );

  if (!hasSearchableText) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>✓ Searchable text ready</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
