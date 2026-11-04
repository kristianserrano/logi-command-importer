/**
 * Returns the longest non-empty prefix that commandId starts with, or null if none match. Empty
 * prefixes are ignored (they would otherwise match everything).
 */
export function longestMatchingPrefix(commandId: string, prefixes: string[]): string | null {
  let best: string | null = null;
  for (const prefix of prefixes) {
    if (prefix.length > 0 && commandId.startsWith(prefix) && (best === null || prefix.length > best.length)) {
      best = prefix;
    }
  }
  return best;
}

/** Returns true if commandId starts with any of the given namespace prefixes. */
export function matchesAnyNamespace(commandId: string, prefixes: string[]): boolean {
  return longestMatchingPrefix(commandId, prefixes) !== null;
}

/**
 * Returns true if sourceExtensionId is one of the given extension ids. Used as an independent
 * inclusion criterion alongside namespace matching (a command is a candidate if it matches a
 * namespace prefix OR belongs to one of these extensions) — an empty list means no extensions
 * are being searched by id, not "match everything".
 */
export function matchesSourceExtension(sourceExtensionId: string, extensionIds: string[]): boolean {
  return extensionIds.includes(sourceExtensionId);
}
