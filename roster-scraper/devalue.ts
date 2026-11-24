/**
 * Nuxt 3 `__NUXT_DATA__` (devalue) decoding.
 *
 * The payload is one flat JSON array; every value in an object or array is an
 * integer index into that array, and index 0 is the root. Tagged wrappers are
 * arrays whose first element is a string, e.g. ["Reactive", 2122].
 *
 * Negative indices are devalue sentinels (undefined / hole / NaN / ±Infinity /
 * -0) and are mapped to null.
 *
 * Used read-only, for the parts of the roster that only exist here — currently
 * the champions block, which the JSON API does not expose at all.
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Resolve a single index (or literal) against the payload. */
export function resolveValue(payload: Json[], index: Json): Json {
  if (typeof index !== 'number') return index; // already a literal
  if (index < 0) return null;
  const value = payload[index];
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const head = value[0];
    if (typeof head === 'string') {
      switch (head) {
        case 'Reactive':
        case 'ShallowReactive':
        case 'Ref':
        case 'ShallowRef':
        case 'EmptyRef':
        case 'EmptyShallowRef':
          return value.length > 1 ? resolveValue(payload, value[1]) : null;
        case 'Set':
          return value.slice(1).map((v) => resolveValue(payload, v));
        case 'Map': {
          const out: Record<string, Json> = {};
          for (let i = 1; i < value.length; i += 2) {
            out[String(resolveValue(payload, value[i]))] = resolveValue(payload, value[i + 1]);
          }
          return out;
        }
        case 'Date':
        case 'RegExp':
        case 'BigInt':
          return value[1] ?? null;
        case 'null':
          return null;
        default:
          throw new Error(`devalue: unknown tag ${JSON.stringify(head)} at index ${index}`);
      }
    }
    return value.map((v) => resolveValue(payload, v));
  }

  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(value)) out[k] = resolveValue(payload, v);
  return out;
}

/** Pull the flat payload out of a server-rendered HTML document. */
export function extractPayload(html: string): Json[] {
  // Attribute order and the nonce vary; match on the id only.
  const m = /<script[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('__NUXT_DATA__ script tag not found in the HTML');
  return JSON.parse(m[1]) as Json[];
}

/** Read a required key off a resolved object, failing loudly. */
export function requireObject(value: Json | undefined, path: string): Record<string, Json> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`payload shape changed: ${path} is ${JSON.stringify(value)}`);
  }
  return value as Record<string, Json>;
}

/** Read a required array off a resolved object, failing loudly. */
export function requireArray(value: Json | undefined, path: string): Json[] {
  if (!Array.isArray(value)) {
    throw new Error(`payload shape changed: ${path} is ${JSON.stringify(value)}`);
  }
  return value;
}
