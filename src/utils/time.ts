/**
 * Convert timestamp to Date object, handling both seconds and milliseconds
 */
export function toDate(timestamp: number): Date {
  // If timestamp is in seconds (less than year 2001), convert to milliseconds
  if (timestamp < 978307200000) {
    // Jan 1, 2001 in milliseconds
    return new Date(timestamp * 1000);
  }
  return new Date(timestamp);
}

/**
 * Format timestamp for display in local time
 */
export function formatTimestamp(timestamp: number): string {
  const date = toDate(timestamp);
  return new Intl.DateTimeFormat('default', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function formatDateYYYYMMDD(timestamp: number): string {
  const date = toDate(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

