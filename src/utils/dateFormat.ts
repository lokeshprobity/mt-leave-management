/**
 * Shared user-facing date and date-time formatting utilities.
 *
 * Converts ISO/calendar dates (YYYY-MM-DD, YYYY/MM/DD, Date, or ISO timestamps)
 * into user-facing DD/MM/YYYY format while preserving underlying API, database,
 * and calculation date strings untouched.
 */

const PURE_YMD_REGEX = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
const PURE_DMY_REGEX = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
const YMD_WITH_TIME_REGEX =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)$/;
const YMD_ISO_MIDNIGHT_REGEX =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s](?:00:00(?::00(?:\.000)?)?(?:Z|[+-]00:?00)?)$/i;
const ISO_DATE_PREFIX_REGEX = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s]/;

/**
 * Returns today's date in YYYY-MM-DD format in the company operational timezone (Asia/Kolkata).
 * Guarantees that users never see tomorrow's or yesterday's date due to local machine offset.
 */
export function getTodayDateStr(timeZone = 'Asia/Kolkata'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {}
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Deterministically returns the day of the week for a YYYY-MM-DD calendar date
 * without any local browser timezone shifts.
 */
export function getDayOfWeekName(
  dateStr?: string | null,
  format: 'short' | 'long' = 'short'
): string {
  if (!dateStr) return '';
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(String(dateStr).trim());
  if (!match) return '';
  const [, y, m, d] = match;
  const utcDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return utcDate.toLocaleDateString('en-US', { weekday: format, timeZone: 'UTC' });
}

/**
 * Formats a date value into user-facing DD/MM/YYYY format.
 * Examples:
 * - "2026/10/01" -> "01/10/2026"
 * - "2026-10-01" -> "01/10/2026"
 * - "2026/09/30" -> "30/09/2026"
 * - "2026-09-30" -> "30/09/2026"
 */
export function formatDate(
  value?: string | Date | number | null,
  fallback = '—'
): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;

    const ymdMatch = PURE_YMD_REGEX.exec(trimmed);
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }

    const dmyMatch = PURE_DMY_REGEX.exec(trimmed);
    if (dmyMatch) {
      const [, day, month, year] = dmyMatch;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }

    const ymdMidnightMatch = YMD_ISO_MIDNIGHT_REGEX.exec(trimmed);
    if (ymdMidnightMatch) {
      const [, year, month, day] = ymdMidnightMatch;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }

    const ymdTimeMatch = YMD_WITH_TIME_REGEX.exec(trimmed);
    if (ymdTimeMatch) {
      const [, year, month, day] = ymdTimeMatch;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }

    // Direct ISO string with date prefix (e.g. 2026-10-01T...)
    const isoPrefixMatch = ISO_DATE_PREFIX_REGEX.exec(trimmed);
    if (isoPrefixMatch) {
      const [, year, month, day] = isoPrefixMatch;
      // If trailing time is midnight or zero offset, keep original calendar date
      if (trimmed.includes('T00:00') || trimmed.includes('T00:00:00')) {
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
    }
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return typeof value === 'string' ? value : fallback;
  }

  // Preserve UTC date for midnight timestamps to eliminate timezone rollbacks
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = String(d.getUTCFullYear());
    return `${day}/${month}/${year}`;
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).formatToParts(d);

  const day =
    parts.find((p) => p.type === 'day')?.value ??
    String(d.getUTCDate()).padStart(2, '0');
  const month =
    parts.find((p) => p.type === 'month')?.value ??
    String(d.getUTCMonth() + 1).padStart(2, '0');
  const year =
    parts.find((p) => p.type === 'year')?.value ?? String(d.getUTCFullYear());

  return `${day}/${month}/${year}`;
}

/**
 * Formats a date-time value into user-facing DD/MM/YYYY with time.
 */
export function formatDateTime(
  value?: string | Date | number | null,
  fallback = '—'
): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;

    const ymdMatch = PURE_YMD_REGEX.exec(trimmed);
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }

    const ymdTimeMatch = YMD_WITH_TIME_REGEX.exec(trimmed);
    if (ymdTimeMatch) {
      const [, year, month, day, timePart] = ymdTimeMatch;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year} ${timePart}`;
    }
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return typeof value === 'string' ? value : fallback;
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).formatToParts(d);

  const day =
    parts.find((p) => p.type === 'day')?.value ??
    String(d.getDate()).padStart(2, '0');
  const month =
    parts.find((p) => p.type === 'month')?.value ??
    String(d.getMonth() + 1).padStart(2, '0');
  const year =
    parts.find((p) => p.type === 'year')?.value ?? String(d.getFullYear());
  const hour =
    parts.find((p) => p.type === 'hour')?.value ??
    String(d.getHours()).padStart(2, '0');
  const minute =
    parts.find((p) => p.type === 'minute')?.value ??
    String(d.getMinutes()).padStart(2, '0');
  const second =
    parts.find((p) => p.type === 'second')?.value ??
    String(d.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year}, ${hour}:${minute}:${second}`;
}

/**
 * Formats a start and end date range into user-facing DD/MM/YYYY format.
 */
export function formatDateRange(
  startDate?: string | Date | null,
  endDate?: string | Date | null,
  separator = ' to '
): string {
  const startFormatted = formatDate(startDate, '');
  const endFormatted = formatDate(endDate, '');
  if (!startFormatted && !endFormatted) return '—';
  if (!endFormatted || startFormatted === endFormatted) {
    return startFormatted || endFormatted;
  }
  return `${startFormatted}${separator}${endFormatted}`;
}
