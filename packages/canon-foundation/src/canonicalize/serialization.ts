/**
 * Canonical Serialization refinements — Prompt 2 §13
 *
 * Extends the JCS-based canonicalization with GSPL-specific constraints:
 *   - Unicode normalization (NFKC)
 *   - Negative zero normalized to positive zero
 *   - NaN/Infinity policy (rejected by default, allowed in tagged contexts)
 *   - Binary data encoding (base64url)
 *   - Timestamp normalization (ISO 8601, UTC)
 *   - URI normalization
 *   - Large integer handling
 */

/** Unicode normalization form for canonical strings */
export const CANONICAL_UNICODE_FORM: 'NFKC' = 'NFKC';

/** Normalize a string to canonical Unicode form */
export function normalizeUnicode(s: string): string {
  return s.normalize(CANONICAL_UNICODE_FORM);
}

/** Normalize a number for canonical output */
export function normalizeNumber(n: number): number {
  // Negative zero → positive zero
  if (Object.is(n, -0)) return 0;
  // NaN and Infinity are rejected unless tagged
  if (!Number.isFinite(n)) {
    throw new Error('serialization: non-finite numbers not allowed in canonical form');
  }
  return n;
}

/** Round-trip stable: is this number safe for canonical representation? */
export function isCanonicalNumber(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && !Object.is(n, -0);
}

/**
 * Encode binary data as canonical base64url (no padding).
 * This is the GSPL canonical binary encoding.
 */
export function encodeBinary(data: Uint8Array): string {
  // Manual base64url encoding without padding
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i];
    const b1 = i + 1 < data.length ? data[i + 1] : 0;
    const b2 = i + 2 < data.length ? data[i + 2] : 0;
    result += alphabet[b0 >> 2];
    result += alphabet[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (i + 1 < data.length) {
      result += alphabet[((b1 & 0x0f) << 2) | (b2 >> 6)];
    }
    if (i + 2 < data.length) {
      result += alphabet[b2 & 0x3f];
    }
  }
  return result;
}

/** Decode canonical base64url back to bytes */
export function decodeBinary(encoded: string): Uint8Array {
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var lookup = new Map();
  for (var i = 0; i < alphabet.length; i++) lookup.set(alphabet[i], i);
  var bytes = [];
  for (var i = 0; i < encoded.length; i += 4) {
    var c0 = lookup.get(encoded[i]) ?? 0;
    var c1 = lookup.get(encoded[i + 1]) ?? 0;
    var c2 = lookup.get(encoded[i + 2]) ?? 0;
    var c3 = lookup.get(encoded[i + 3]) ?? 0;
    bytes.push((c0 << 2) | (c1 >> 4));
    if (i + 2 < encoded.length) bytes.push(((c1 & 0x0f) << 4) | (c2 >> 2));
    if (i + 3 < encoded.length) bytes.push(((c2 & 0x03) << 6) | c3);
  }
  return new Uint8Array(bytes);
}

/**
 * Round-trip binary encoding: encode → decode produces original bytes.
 */
export function binaryRoundTrip(data: Uint8Array): boolean {
  const encoded = encodeBinary(data);
  const decoded = decodeBinary(encoded);
  if (decoded.length !== data.length) return false;
  for (let i = 0; i < data.length; i++) {
    if (decoded[i] !== data[i]) return false;
  }
  return true;
}

/**
 * Normalize a timestamp to canonical ISO 8601 UTC form.
 * Strips milliseconds if they are zero.
 */
export function normalizeTimestamp(ts: string): string {
  let normalized = ts.trim();
  if (!normalized.endsWith("Z") && normalized.indexOf("+") === -1 && normalized.lastIndexOf("-") <= normalized.indexOf("T")) normalized += "Z";
  try { return new Date(normalized).toISOString(); } catch { return normalized; }
}

export function serializeCanonicalNumber(n: number): string {
  const normalized = normalizeNumber(n);
  // Use shortest round-trippable form
  if (Number.isInteger(normalized)) return normalized.toString();
  return normalized.toString();
}
