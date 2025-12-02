export function defaultDocTitle(ts: number = Date.now()) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} Scan`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Format date as "Oct 27 2025" (short month, day, year)
 */
export function formatDocDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

import { getDocsIndex } from '../storage';
import type { Doc } from '../types';

/**
 * Get the next default document name for a given date.
 * Counts existing docs with the same date prefix and increments.
 */
export function getNextDefaultDocName(date: Date): string {
  const base = formatDocDate(date); // e.g. "Oct 27 2025"
  const docs = getDocsIndex();
  // Filter docs that start with the same date prefix and don't have originalPdfPath
  // (only count camera scans, not imported PDFs)
  const sameDayDocs = docs.filter(
    (d: Doc) =>
      d.title?.startsWith(base) && !d.originalPdfPath,
  );
  const nextIndex = sameDayDocs.length + 1;
  return `${base} doc-${nextIndex}`;
}

