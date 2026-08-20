/**
 * Utilitaires partagés — server + client compatible.
 */

/**
 * Fusion profonde : les valeurs de `overrides` écrasent `defaults` récursivement.
 * Les tableaux sont remplacés (non fusionnés). Les objets sont fusionnés.
 */
export function deepMerge(defaults: unknown, overrides: unknown): unknown {
  if (!isPlainObject(defaults) || !isPlainObject(overrides)) return overrides ?? defaults;
  const result: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const key of Object.keys(overrides as Record<string, unknown>)) {
    const d = (defaults as Record<string, unknown>)[key];
    const o = (overrides as Record<string, unknown>)[key];
    result[key] = isPlainObject(d) && isPlainObject(o) ? deepMerge(d, o) : (o ?? d);
  }
  return result;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
