/**
 * JSON Canonicalization Scheme (JCS, RFC 8785) — adapted to GSPL data.
 *
 * Per `packages/canon-foundation/test/canon-foundation.test.ts`:
 *  - Same seed ⇒ same canonical bytes.
 *  - `$hash` excluded from hash material.
 *  - `$lineage.timestamp` excluded from hash material.
 *  - Object keys sorted lexicographically within each nested object.
 *  - Numeric values use shortest round-trippable form (e.g., 1.5 ⇒ "1.5", not "1.50").
 *  - `canonicalizeGene(gene)` returned bytes contain `"scalar"` for a typed gene.
 *
 * This is a faithful but intentionally MINIMAL subset of RFC 8785. Full RFC 8785
 * covers a wider edge-case set (NaN, BigInt, surrogate pairs). For Prompt 1
 * canon purposes, the implementations of NaN/BigInt are explicit no-ops (we
 * never carry them through canon-foundation). Unicode preservation is via
 * UTF-8 without escaping (sufficient for round-trip stability through Node).
 */

import type { Gene, UniversalSeed } from '../types/universal-seed.js';

/** Sentinel values structurally not part of any canonical seed form. */
const HASH_EXCLUSION_KEYS = new Set(['$hash']);
const TIMESTAMP_EXCLUSION_KEYS = new Set(['timestamp']);

/** Numeric serializer matching ECMA-262 Number.prototype.toString. */
function serializeNumber(n: number): string {
  if (Number.isNaN(n) || !Number.isFinite(n)) {
    throw new Error('canonicalize: NaN/Infinity are not allowed in canon-foundation v0.1');
  }
  // Round-trip: small integer fast path via .toString yields the shortest form
  // (e.g., 1.5 → "1.5", 100 → "100", 0.1 → "0.1").
  if (Number.isInteger(n)) return n.toString();
  return n.toString();
}

/** Serialize a string as a JSON string literal. */
function serializeString(s: string): string {
  // We do NOT use JSON.stringify here because some escapes are not stable
  // across Node versions for surrogate pairs. Instead, we use the most
  // conservative subset: escape `\` and `"` only. Round-trip stable UTF-8 is
  // sufficient for canon tests.
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch.charCodeAt(0) < 0x20) {
      out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
    } else {
      out += ch;
    }
  }
  return out + '"';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recursive serializer with depth-limit safety. */
function canonicalizeValue(value: unknown, depth: number): string {
  if (depth > 256) throw new Error('canonicalize: depth limit exceeded');
  if (value === null) return 'null';
  if (value === undefined) return 'null'; // RFC 8785 2.2.3: undefined in objects is dropped (we accept it at array position by treating it as null)
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return serializeNumber(value);
  if (typeof value === 'string') return serializeString(value);
  if (typeof value === 'bigint') {
    throw new Error('canonicalize: BigInt is not allowed in canon-foundation v0.1');
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (let i = 0; i < value.length; i++) {
      out.push(canonicalizeValue(value[i], depth + 1));
    }
    return '[' + out.join(',') + ']';
  }
  if (isPlainObject(value)) {
    // Drop excluded top-level keys at any depth? No — only $hash at top level.
    // However, $lineage.timestamp is also excluded. We handle that by
    // constructing a filtered view for these two specific keys BEFORE recursing
    // is too complex. Instead, we recursively serialize and the caller
    // (canonicalizeSeed) prepares the input with top-level fields stripped.
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = (value as Record<string, unknown>)[k];
      if (v === undefined) continue; // RFC 8785 2.2.3
      parts.push(serializeString(k) + ':' + canonicalizeValue(v, depth + 1));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('canonicalize: unsupported value type ' + typeof value);
}

/**
 * Strip the fields that are NOT part of identity (hash material).
 *  - $hash (top-level)
 *  - $lineage.timestamp (nested)
 */
function stripIdentityFields(seed: UniversalSeed): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // We treat the UniversalSeed as an open record for the sole purpose of
  // stripping identity fields; the runtime shape matches the canonical
  // schema. Casting through `unknown` is the documented TS workaround for
  // missing index signatures on nominally typed objects.
  const raw = seed as unknown as Record<string, unknown>;
  for (const k of Object.keys(raw)) {
    if (HASH_EXCLUSION_KEYS.has(k)) continue;
    const v = raw[k];
    if (k === '$lineage' && isPlainObject(v)) {
      const lin: Record<string, unknown> = {};
      for (const lk of Object.keys(v)) {
        if (!TIMESTAMP_EXCLUSION_KEYS.has(lk)) lin[lk] = v[lk];
      }
      out[k] = lin;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Compute the canonical byte sequence of a UniversalSeed.
 *
 * The bytes are UTF-8. Same input ⇒ same output (deterministic).
 */
export function canonicalize(seed: UniversalSeed): Uint8Array {
  const filtered = stripIdentityFields(seed);
  const text = canonicalizeValue(filtered, 0);
  return new TextEncoder().encode(text);
}

/**
 * Compute the canonical byte sequence of a single Gene value.
 */
export function canonicalizeGene(gene: Gene): Uint8Array {
  const text = canonicalizeValue(gene, 0);
  return new TextEncoder().encode(text);
}

/**
 * Compute the canonical byte sequence of an arbitrary value (e.g. governance
 * metadata) under the same JCS rules, for use by conformance tooling.
 */
export function canonicalizeAny(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeValue(value, 0));
}
