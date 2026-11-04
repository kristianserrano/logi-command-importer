import { longestMatchingPrefix } from "./filtering";

/** Category for undeclared commands: the registry gives no owner, and this is Logitech's own default category. */
export const SAVED_COMMANDS_GROUP = "Saved Commands";

const ACRONYM_PATTERN = /^[A-Z0-9]+$/;

/**
 * Splits a command id like "myExtension.insertConsoleLog" or "workbench.action.debug.stop"
 * into readable words, then title-cases them. The final path segment (after the last dot) is
 * used as the primary label; leading namespace segments are dropped since they are redundant
 * with the source extension / group.
 */
export function inferDisplayName(commandId: string): string {
  const segments = commandId.split(".").filter((segment) => segment.length > 0);
  const lastSegment = segments[segments.length - 1] ?? commandId;
  return formatSegment(lastSegment);
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

/** Lowercase, space-separated words from an id fragment: "views.openOnDotDev" -> "views open on dot dev". */
export function toLowercaseWords(fragment: string): string {
  return fragment
    .split(".")
    .flatMap(splitIntoWords)
    .map((word) => word.toLowerCase())
    .join(" ");
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
  return words.length === 0 ? segment : words.map(titleCaseWord).join(" ");
}

/**
 * Derives a display name from a manifest-declared (or generated) title, used verbatim — it's the extension
 * developer's own deliberate wording, not something this tool should second-guess or rewrite
 * (including whatever prefix or lack thereof they chose to type into it). Falls back to
 * inferring a name from the command id only when no title is declared at all. Anyone who wants
 * a specific command's name changed can do so explicitly via `displayNameOverrides`.
 */
export function buildDisplayNameFromManifest(commandId: string, title: string | undefined): string {
  return title || inferDisplayName(commandId);
}

/**
 * Derives a subgroup: the `rules` entry with the longest matching prefix wins. Otherwise, if a
 * configured namespace prefix matches, the subgroup is the id after that prefix with the final
 * segment dropped and the rest title-cased (e.g. "workbench.action.terminal.new" with prefix
 * "workbench.action." yields "Terminal"). No remaining namespace means no subgroup.
 *
 * Callers pass namespace prefixes only for undeclared commands; declared and generated commands
 * pass none, so for them only `rules` can apply.
 */
export function deriveDefaultSubGroup(
  commandId: string,
  rules: Record<string, string>,
  namespacePrefixes: string[] = []
): string | null {
  const rulePrefix = longestMatchingPrefix(commandId, Object.keys(rules));
  if (rulePrefix !== null) {
    return rules[rulePrefix];
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
