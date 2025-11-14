// src/utils/paths.ts
// Utility functions for handling file paths and URIs

export function stripFileScheme(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

export function toFsPath(uri: string): string {
  const noScheme = uri.startsWith('file://') ? uri.slice(7) : uri;
  return decodeURI(noScheme);
}

export function toBestPath(uri: string) {
  // Some native libs want paths without scheme, some accept file://.
  // Try file:// first, fall back to plain path.
  const plain = uri.startsWith('file://') ? uri.slice(7) : uri;
  return { withScheme: uri, plain };
}

