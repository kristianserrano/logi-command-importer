import { CandidateEntry, DiscoveredCommand, ImporterConfig } from "./types";
import { matchesAnyNamespace, matchesSourceExtension } from "./filtering";
import { applyFindReplaceRules } from "./findReplace";
import { buildDisplayNameFromManifest, deriveDefaultSubGroup, inferDisplayName, SAVED_COMMANDS_GROUP, toLowercaseWords } from "./naming";

/**
 * Builds the candidate catalog entries (with derived + overridden naming) shown to the user.
 *
 * Inclusion: a command is a candidate if it matches a configured namespace prefix (any kind) OR
 * belongs to a picked source extension (declared/generated only — undeclared commands have no
 * owner). With neither list configured, every declared and generated command qualifies, but
 * undeclared ones never do without a prefix match (the registry is mostly VS Code internals).
 *
 * Naming: declared commands group under their manifest category (else the extension name) with no
 * subcategory unless a `subGroupRules` match applies; generated view commands group under the
 * extension name with the subcategory chosen in discovery; undeclared commands go under the fixed
 * SAVED_COMMANDS_GROUP with a subcategory stripped from the matched namespace prefix.
 *
 * `displayNameFindReplace` applies to derived display names and `groupNameFindReplace` to derived
 * group names of declared/generated commands — never to explicit overrides (already the final
 * answer) nor to the fixed Saved Commands group.
 */
function isCandidateIncluded(cmd: DiscoveredCommand, config: ImporterConfig): boolean {
  const hasAnyCriteria = config.namespacePrefixes.length > 0 || config.sourceExtensionFilters.length > 0;
  const isUndeclared = cmd.kind === "undeclared";
  const matchesNamespace = matchesAnyNamespace(cmd.commandId, config.namespacePrefixes);
  const matchesExtension = !isUndeclared && matchesSourceExtension(cmd.sourceExtensionId, config.sourceExtensionFilters);

  return hasAnyCriteria ? matchesNamespace || matchesExtension : !isUndeclared;
}

function resolveSubGroupName(cmd: DiscoveredCommand, config: ImporterConfig): string | null {
  const isUndeclared = cmd.kind === "undeclared";

  return (
    deriveDefaultSubGroup(cmd.commandId, config.subGroupRules, isUndeclared ? config.namespacePrefixes : []) ??
    cmd.defaultSubGroupName ??
    null
  );
}

function resolveDisplayName(cmd: DiscoveredCommand, config: ImporterConfig, subGroupName: string | null): string {
  const isUndeclared = cmd.kind === "undeclared";
  const derivedName = isUndeclared ? inferDisplayName(cmd.commandId) : buildDisplayNameFromManifest(cmd.commandId, cmd.title);
  const derivedDisplayName = isUndeclared && subGroupName ? `${subGroupName}: ${derivedName}` : derivedName;

  return config.displayNameOverrides[cmd.commandId] ?? applyFindReplaceRules(derivedDisplayName, config.displayNameFindReplace);
}

function resolveGroupName(cmd: DiscoveredCommand, config: ImporterConfig): string {
  const isUndeclared = cmd.kind === "undeclared";
  const derivedGroupName = isUndeclared
    ? SAVED_COMMANDS_GROUP
    : applyFindReplaceRules(cmd.category ?? cmd.sourceExtensionDisplayName, config.groupNameFindReplace);

  return config.groupNameOverrides[cmd.commandId] ?? derivedGroupName;
}

export function buildCandidates(discovered: DiscoveredCommand[], config: ImporterConfig): CandidateEntry[] {
  const candidates: CandidateEntry[] = [];
  for (const cmd of discovered) {
    if (!isCandidateIncluded(cmd, config)) {
      continue;
    }

    const subGroupName = resolveSubGroupName(cmd, config);
    const displayName = resolveDisplayName(cmd, config, subGroupName);
    const groupName = resolveGroupName(cmd, config);

    candidates.push({
      commandId: cmd.commandId,
      sourceExtensionId: cmd.sourceExtensionId,
      sourceExtensionDisplayName: cmd.sourceExtensionDisplayName,
      displayName,
      groupName,
      subGroupName,
    });
  }

  disambiguateDuplicateNames(candidates, config.displayNameOverrides);
  return candidates.sort((a, b) => a.commandId.localeCompare(b.commandId));
}

/**
 * Logi shows only the title, so entries sharing a category, subcategory and title are
 * indistinguishable. Where that happens, appends " (<part of the id that differs>)" to each: the
 * id segments left after trimming the prefix and suffix segments the colliding ids share (e.g.
 * `gitlens.views.branches.x` / `gitlens.views.remotes.x` become "(branches)" / "(remotes)"), shown
 * as lowercase space-separated words ("openOnDotDev" becomes "open on dot dev"). At least one
 * segment is always kept; if two qualifiers still come out equal (ids differing only by case),
 * the full command id is used instead.
 * Unique titles are untouched, and an explicit `displayNameOverrides` entry is never altered.
 */
function disambiguateDuplicateNames(candidates: CandidateEntry[], displayNameOverrides: Record<string, string>): void {
  const collisions = new Map<string, CandidateEntry[]>();
  for (const c of candidates) {
    const key = [c.groupName, c.subGroupName ?? "", c.displayName].join("\u0000").toLowerCase();
    collisions.set(key, [...(collisions.get(key) ?? []), c]);
  }

  for (const set of collisions.values()) {
    if (set.length < 2) {
      continue;
    }
    const segments = set.map((c) => c.commandId.split("."));
    const minLength = Math.min(...segments.map((s) => s.length));
    let head = 0;
    while (head < minLength - 1 && segments.every((s) => s[head] === segments[0][head])) {
      head++;
    }
    let tail = 0;
    while (tail < minLength - head - 1 && segments.every((s) => s[s.length - 1 - tail] === segments[0][segments[0].length - 1 - tail])) {
      tail++;
    }
    const qualifiers = segments.map((s) => toLowercaseWords(s.slice(head, s.length - tail).join(".")));
    const usable = qualifiers.every((q) => q.length > 0) && new Set(qualifiers).size === qualifiers.length;

    set.forEach((c, i) => {
      if (c.commandId in displayNameOverrides) {
        return;
      }
      c.displayName = `${c.displayName} (${usable ? qualifiers[i] : c.commandId})`;
    });
  }
}

/**
 * Removes candidates whose commandId already exists in the catalog as an actionName. Re-selecting
 * one would just be skipped as a duplicate on import anyway (see catalogIO.mergeEntries), so
 * filtering it out of the picker up front saves picking something that would be a no-op.
 */
export function excludeAlreadyCataloged(
  candidates: CandidateEntry[],
  existingActionNames: Iterable<string>
): CandidateEntry[] {
  const existing = new Set(existingActionNames);
  return candidates.filter((c) => !existing.has(c.commandId));
}
