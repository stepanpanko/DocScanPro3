import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type CropToolbarProps = {
  onCancel: () => void;
  onApply: () => void;
  disabled?: boolean;
};

export function CropToolbar({
  onCancel,
  onApply,
  disabled = false,
}: CropToolbarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <Pressable onPress={onCancel} style={styles.cancelButton}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
      <Pressable
        onPress={onApply}
        disabled={disabled}
        style={[styles.applyButton, disabled && styles.applyButtonDisabled]}
      >
        <Text style={styles.applyText}>Apply</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(18, 18, 18, 0.85)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 17,
    color: '#ddd',
    fontWeight: '400',
  },
  applyButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyText: {
    fontSize: 17,
    color: 'white',
    fontWeight: '600',
  },
});
