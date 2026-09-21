/**
 * Combines a Quick Pick item's searchable fields into one lowercased string for literal
 * substring matching.
 */
export function buildSearchText(fields: (string | undefined)[]): string {
  return fields.filter((f): f is string => Boolean(f)).join(" ").toLowerCase();
}

/**
 * True if `searchText` (already lowercased, e.g. via buildSearchText) contains `query` as a
 * literal, case-insensitive substring. An empty/whitespace-only query matches everything.
 *
 * This exists because VS Code's built-in Quick Pick filter is always fuzzy subsequence matching
 * (any characters appearing in order, anywhere across the matched fields) — searching "Logi "
 * (with a trailing space) will match "turboConsoleLog.insertConsoleLog" purely because it
 * contains an L, an o, a g, and later an i in some order, which is surprising and hard to
 * predict for anyone not expecting fuzzy matching. Literal substring matching is what most
 * people actually expect when they type a specific string.
 */
export function matchesLiteralQuery(searchText: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return true;
  }
  return searchText.includes(needle);
}
