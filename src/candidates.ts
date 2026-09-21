import { CandidateEntry, DiscoveredCommand, ImporterConfig } from "./types";
import { matchesAnyNamespace, matchesSourceExtension } from "./filtering";
import { inferPredominantNamespaceRoots } from "./discovery";
import { applyFindReplaceRules } from "./findReplace";
import { buildDisplayNameFromManifest, deriveDefaultGroup, deriveDefaultSubGroup } from "./naming";

/**
 * Filters discovered commands by namespace prefix and/or source extension and builds the
 * candidate catalog entries (with inferred + overridden naming) shown to the user for review. A
 * command is a candidate if it matches *either* a configured namespace prefix or one of the
 * configured source extension ids — the two are independent ways in, not a narrowing AND, since
 * "give me everything from this extension" (e.g. to catch VS Code's auto-generated per-view
 * commands, which share no namespace with an extension's own declared commands) is a real need
 * a namespace prefix alone can't express.
 *
 * VS Code's own auto-generated per-view/per-container commands (`isGenerated`, resolved via
 * exact view/container id matches — see discovery.ts) are always excluded, with no override: they
 * were never declared by any extension, are never Command Palette-visible, and Logi's own default
 * catalog contains zero of them. Anyone who genuinely wants one can add it directly in Logi
 * Options+. This is a hard exclusion specifically because it's precise, not a suffix guess — a
 * deliberate, titled command like "Open in Terminal" ending in ".open" is never affected by it,
 * only commands whose id exactly matches a real declared view/container id are.
 *
 * `displayNameFindReplace`/`groupNameFindReplace` rules are applied to the *inferred* display
 * name and group only — never to an explicit `displayNameOverrides`/`groupNameOverrides` entry,
 * since an override is already the final, deliberate answer for that specific command.
 */
export function buildCandidates(discovered: DiscoveredCommand[], config: ImporterConfig): CandidateEntry[] {
  // With no namespace prefixes and no source extension filters configured at all, there's no
  // criterion to filter by — show every discovered command rather than nothing, the same way
  // VS Code's own Command Palette shows everything and relies on its search box to narrow down,
  // rather than requiring some filter to be picked first.
  const hasAnyCriteria = config.namespacePrefixes.length > 0 || config.sourceExtensionFilters.length > 0;

  // Each extension's own predominant namespace root (from its own manifest-declared commands, not
  // anything the user typed) gives extension-based search the same subgroup derivation that
  // namespace-prefix search already gets — without it, everything from an extension-only search
  // would have no subgroup at all, since there'd be no matched prefix to strip.
  const predominantRootByExtension = inferPredominantNamespaceRoots(discovered.filter((c) => c.title !== undefined));

  const candidates: CandidateEntry[] = [];
  for (const cmd of discovered) {
    if (cmd.isGenerated) {
      continue;
    }
    const matchesNamespace = matchesAnyNamespace(cmd.commandId, config.namespacePrefixes);
    const matchesExtension = matchesSourceExtension(cmd.sourceExtensionId, config.sourceExtensionFilters);
    if (hasAnyCriteria && !matchesNamespace && !matchesExtension) {
      continue;
    }

    const displayName =
      config.displayNameOverrides[cmd.commandId] ??
      applyFindReplaceRules(
        buildDisplayNameFromManifest(cmd.commandId, cmd.title),
        config.displayNameFindReplace
      );
    const groupName =
      config.groupNameOverrides[cmd.commandId] ??
      applyFindReplaceRules(deriveDefaultGroup(cmd.sourceExtensionDisplayName), config.groupNameFindReplace);
    const predominantRoot = predominantRootByExtension.get(cmd.sourceExtensionId);
    const subGroupPrefixes = predominantRoot
      ? [...config.namespacePrefixes, predominantRoot]
      : config.namespacePrefixes;
    const subGroupName = deriveDefaultSubGroup(cmd.commandId, config.subGroupRules, subGroupPrefixes);

    candidates.push({
      commandId: cmd.commandId,
      sourceExtensionId: cmd.sourceExtensionId,
      sourceExtensionDisplayName: cmd.sourceExtensionDisplayName,
      displayName,
      groupName,
      subGroupName,
    });
  }
  return candidates.sort((a, b) => a.commandId.localeCompare(b.commandId));
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
