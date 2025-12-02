/**
 * Extract filename from URI, handling various URI schemes
 * Decodes URL-encoded characters like %20 (space) to ensure human-readable filenames
 */
export function extractFilenameFromUri(uri: string): string {
  try {
    // Remove query parameters
    const withoutQuery = uri.split('?')[0] ?? uri;
    // Remove fragment
    const withoutFragment = withoutQuery.split('#')[0] ?? withoutQuery;
    // Split by path separators
    const parts = withoutFragment.split('/');
    // Get last part
    const raw = parts[parts.length - 1] || 'Document';
    
    // Decode URL-encoded characters like %20 (space), %5F (_), etc.
    try {
      return decodeURIComponent(raw);
    } catch {
      // If decodeURIComponent fails (e.g., invalid encoding), return raw
      return raw;
    }
  } catch {
    return 'Document';
  }
}

/**
 * Remove file extension from filename
 */
export function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : filename;
}

/**
 * Sanitize filename for use in file systems
 * Removes or replaces characters that are problematic in filenames
 */
export function sanitizeFilename(filename: string): string {
  // Remove or replace problematic characters
  return filename
    .replace(/[<>:"/\\|?*]/g, '-') // Replace problematic chars with dash
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .slice(0, 200); // Limit length
}

