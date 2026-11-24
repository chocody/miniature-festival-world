export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

/** Plain object: prototype is Object.prototype or null (same rule as validateCoord). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isJsonValueInner(value: unknown, stack: Set<object>): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false; // undefined, function, symbol, bigint
  if (stack.has(value)) return false; // cycle
  stack.add(value);
  try {
    if (Array.isArray(value)) return value.every((item) => isJsonValueInner(item, stack));
    if (!isPlainObject(value)) return false; // Date, Map, class instances
    return Object.values(value).every((item) => isJsonValueInner(item, stack));
  } finally {
    stack.delete(value);
  }
}

/** Plain object whose values are JSON values all the way down (finite numbers only, no cycles, no class instances). */
export function isJsonObject(value: unknown): value is JsonObject {
  return isPlainObject(value) && isJsonValueInner(value, new Set());
}

/** Deep copy of a JSON object, or null if `value` is not one (isJsonObject). Used to store a validated appearance. */
export function cloneJsonObject(value: unknown): JsonObject | null {
  if (!isJsonObject(value)) return null;
  return structuredClone(value) as JsonObject;
}
