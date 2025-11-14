import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: ButtonProps) {
  const getButtonStyle = () => {
    const base = styles.button;
    switch (variant) {
      case 'primary':
        return [base, styles.primary, disabled && styles.disabled];
      case 'secondary':
        return [base, styles.secondary, disabled && styles.disabled];
      case 'danger':
        return [base, styles.danger, disabled && styles.disabled];
      default:
        return [base, styles.primary, disabled && styles.disabled];
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'primary':
        return [styles.text, styles.primaryText];
      case 'secondary':
        return [styles.text, styles.secondaryText];
      case 'danger':
        return [styles.text, styles.dangerText];
      default:
        return [styles.text, styles.primaryText];
    }
  };

  return (
    <Pressable onPress={onPress} disabled={disabled} style={getButtonStyle()}>
      <Text style={getTextStyle()}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: '#2563EB',
  },
  secondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  danger: {
    backgroundColor: '#EF4444',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: '#0F172A',
  },
  dangerText: {
    color: '#FFFFFF',
  },
});
