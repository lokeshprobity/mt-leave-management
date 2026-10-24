/**
 * A meaningful leave reason must contain at least 10 non-padding characters,
 * at least two descriptive words, and real alphabetic content.
 * Reject placeholder strings such as ####, ****, repeated punctuation, or xxxx.
 */
export function validateMeaningfulLeaveReason(value: string): string | null {
  const reason = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (reason.length < 10) return 'Please enter a meaningful leave reason (at least 10 characters).';
  const letters = (reason.match(/[a-z]/gi) || []).length;
  if (letters < 5) return 'Leave reason must contain meaningful words, not only symbols or numbers.';
  const alphanumeric = reason.replace(/[^a-z0-9]/gi, '');
  if (!alphanumeric || /^(.)\1{4,}$/i.test(alphanumeric)) {
    return 'Please replace placeholder or repeated characters with a meaningful leave reason.';
  }
  const words = reason.split(/\s+/).filter((word) => /[a-z]{2,}/i.test(word));
  if (words.length < 2) return 'Please describe the reason using at least two meaningful words.';
  if (/^[#*._-]+$/.test(reason)) return 'Symbols alone are not a valid leave reason.';
  return null;
}
