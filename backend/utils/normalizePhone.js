/**
 * Normalize a phone number to E.164 format (+[country][number]).
 * Handles:
 *  - Already-prefixed numbers with +  (e.g. +919876543210)
 *  - 12-digit numbers starting with 91 (treated as already country-coded)
 *  - 10-digit Indian numbers (prepend 91)
 *  - Strips all non-digit characters first
 */
export function normalizePhone(phone) {
  if (!phone) return null;

  // Strip everything except digits
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 0) return null;

  // Already has full country code (12 digits starting with 91 → India)
  if (digits.length === 12 && digits.startsWith("91")) {
    return "+" + digits;
  }

  // 10-digit local Indian number → prepend 91
  if (digits.length === 10) {
    return "+91" + digits;
  }

  // Other lengths: assume caller passed a full international number (no leading +)
  // e.g. 14155551234 (US 11-digit)
  if (digits.length >= 11 && digits.length <= 15) {
    return "+" + digits;
  }

  // Unrecognised format — return null so caller can reject
  return null;
}
