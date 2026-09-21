const ACRONYM_PATTERN = /^[A-Z0-9]+$/;

/**
 * Splits a command id like "turboConsoleLog.insertConsoleLog" or "workbench.action.debug.stop"
 * into readable words, then title-cases them. The final path segment (after the last dot) is
 * used as the primary label; leading namespace segments are dropped since they are redundant
 * with the source extension / group.
 */
export function inferDisplayName(commandId: string): string {
  const segments = commandId.split(".").filter((segment) => segment.length > 0);
  const lastSegment = segments[segments.length - 1] ?? commandId;
  const words = splitIntoWords(lastSegment);
  if (words.length === 0) {
    return commandId;
  }
  return words.map(titleCaseWord).join(" ");
}

function splitIntoWords(segment: string): string[] {
  const withSpaces = segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ");
  return withSpaces
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

function titleCaseWord(word: string): string {
  if (ACRONYM_PATTERN.test(word) && word.length > 1) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Splits a raw identifier segment (camelCase, hyphenated, or underscored) into a readable, title-cased label. */
function formatSegment(segment: string): string {
  const words = splitIntoWords(segment);
  if (words.length === 0) {
    return segment;
  }
  return words.map(titleCaseWord).join(" ");
}

/** Derives the default Logi group name from the source extension's display name. */
export function deriveDefaultGroup(sourceExtensionDisplayName: string): string {
  return sourceExtensionDisplayName.trim() || "Other";
}

/**
 * Derives a display name from a manifest-declared title, used verbatim — it's the extension
 * developer's own deliberate wording, not something this tool should second-guess or rewrite
 * (including whatever prefix or lack thereof they chose to type into it). Falls back to
 * inferring a name from the command id only when no title is declared at all. Anyone who wants
 * a specific command's name changed can do so explicitly via `displayNameOverrides`.
 */
export function buildDisplayNameFromManifest(commandId: string, title: string | undefined): string {
  if (!title) {
    return inferDisplayName(commandId);
  }
  return title;
}

function longestMatchingPrefix(commandId: string, prefixes: string[]): string | null {
  let best: string | null = null;
  for (const prefix of prefixes) {
    if (prefix.length > 0 && commandId.startsWith(prefix)) {
      if (!best || prefix.length > best.length) {
        best = prefix;
      }
    }
  }
  return best;
}

/**
 * Derives a subgroup from the longest matching configured rule prefix. When no rule matches,
 * falls back to the command id's namespace *after* stripping whichever configured namespace
 * prefix matched it (e.g. "claude-vscode.editor.open" with namespace prefix "claude-vscode."
 * yields "Editor", not "Claude Vscode Editor") — the namespace root is already represented by
 * the group, so repeating it in every subgroup would just be redundant. A top-level command
 * with nothing left after stripping the matched prefix (e.g. "claude-vscode.acceptChange") gets
 * no subgroup at all, rather than one that just repeats the namespace root.
 *
 * This namespace-stripping fallback only runs when a namespace prefix actually matched the
 * command (i.e. it's genuinely being searched by namespace, not just by source extension) —
 * without a shared prefix to strip, deriving a subgroup from a command's full, un-stripped
 * namespace produces a different, incoherent subgroup for every distinctly-shaped command-id
 * family a single extension happens to use (its own commands, VS Code's auto-generated
 * per-view/per-container commands, etc.), fragmenting one extension into a dozen-plus
 * near-meaningless subgroups instead of one coherent group. In that case, commands get no
 * default subgroup at all (still overridable via `subGroupRules`).
 */
export function deriveDefaultSubGroup(
  commandId: string,
  rules: Record<string, string>,
  namespacePrefixes: string[] = []
): string | null {
  let bestPrefix: string | null = null;
  let bestSubGroupName: string | null = null;
  for (const [prefix, subGroupName] of Object.entries(rules)) {
    if (!prefix) {
      continue;
    }
    if (commandId.startsWith(prefix)) {
      if (!bestPrefix || prefix.length > bestPrefix.length) {
        bestPrefix = prefix;
        bestSubGroupName = subGroupName;
      }
    }
  }
  if (bestSubGroupName !== null) {
    return bestSubGroupName;
  }

  const matchedPrefix = longestMatchingPrefix(commandId, namespacePrefixes);
  if (!matchedPrefix) {
    return null;
  }
  const remainder = commandId.slice(matchedPrefix.length);

  const lastDot = remainder.lastIndexOf(".");
  if (lastDot <= 0) {
    return null;
  }
  const innerNamespace = remainder.slice(0, lastDot);
  const nsSegments = innerNamespace.split(".").filter((s) => s.length > 0);
  if (nsSegments.length === 0) {
    return null;
  }
  return nsSegments.map(formatSegment).join(" ");
}
