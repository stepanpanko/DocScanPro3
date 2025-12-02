import type { ExportQuality } from '../types';

export type ExportProfile = {
  maxWidth: number;
  maxHeight: number;
  jpegQuality: number; // 0..1
};

export function getExportProfile(
  q: ExportQuality = 'color-medium',
): ExportProfile {
  switch (q) {
    case 'color-high':
      return { maxWidth: 2500, maxHeight: 3500, jpegQuality: 0.8 }; // ~200–250 dpi
    case 'grayscale':
      return { maxWidth: 2000, maxHeight: 3000, jpegQuality: 0.7 }; // smaller, still sharp
    case 'color-medium':
    default:
      return { maxWidth: 2000, maxHeight: 3000, jpegQuality: 0.7 }; // ~150–200 dpi
  }
}

