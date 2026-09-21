/** Returns true if commandId starts with any of the given namespace prefixes. */
export function matchesAnyNamespace(commandId: string, prefixes: string[]): boolean {
  if (prefixes.length === 0) {
    return false;
  }
  return prefixes.some((prefix) => prefix.length > 0 && commandId.startsWith(prefix));
}

/**
 * Returns true if sourceExtensionId is one of the given extension ids. Used as an independent
 * inclusion criterion alongside namespace matching (a command is a candidate if it matches a
 * namespace prefix OR belongs to one of these extensions) — an empty list means no extensions
 * are being searched by id, not "match everything".
 */
export function matchesSourceExtension(sourceExtensionId: string, extensionIds: string[]): boolean {
  return extensionIds.length > 0 && extensionIds.includes(sourceExtensionId);
}
