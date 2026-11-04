import * as vscode from "vscode";
import { excludeAlreadyCataloged } from "../candidates";
import { DETAIL_SEPARATOR } from "../constants";
import { extensionDisplayName, hasDeclaredCommands } from "../discovery";
import { formatCategoryLabel, withBackupNote, withRefreshReminder } from "../formatting";
import { performImport } from "../importService";
import { LiteralPickEntry, showLiteralMultiSelectQuickPick } from "../quickPick";
import { CandidateEntry, ImporterConfig } from "../types";
import { discoverCandidates, getConfig, getInstalledExtensions, readCurrentCatalog } from "./shared";

/**
 * Optionally scope discovery to specific extensions. Picking an extension includes its declared
 * commands plus the view commands (`Focus on ...` / `Show ...`) generated from its views. With
 * nothing picked (confirm with none checked, or Escape — treated the same) and no
 * `namespacePrefixes` configured, every declared and view command from all extensions is offered,
 * and the next step's Quick Pick — which already searches label, command id, and detail as you
 * type — is what narrows it down. VS Code's own commands and runtime-only commands (the "Saved
 * Commands" category) are offered only when they match a `namespacePrefixes` entry, which always
 * adds its own matches on top of whatever's picked here.
 *
 * Only extensions that declare at least one command are listed — themes, keymaps, and other
 * command-less extensions have nothing to offer here (see hasDeclaredCommands).
 */
async function promptForSourceExtensions(config: ImporterConfig): Promise<string[]> {
  const preselected = new Set(config.sourceExtensionFilters);
  const entries: LiteralPickEntry[] = getInstalledExtensions()
    .filter((e) => hasDeclaredCommands(e))
    .map((e) => ({
      id: e.id,
      label: extensionDisplayName(e),
      description: e.id,
      picked: preselected.has(e.id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const picked = await showLiteralMultiSelectQuickPick(entries, {
    title: "Import commands from which extensions? (optional)",
    placeHolder:
      "Checked extensions contribute their commands and view commands. With none checked and no namespace prefixes set, all extensions' commands are offered.",
  });

  return picked ?? [];
}

async function pickCandidates(candidates: CandidateEntry[]): Promise<CandidateEntry[] | undefined> {
  if (candidates.length === 0) {
    vscode.window.showInformationMessage("No commands were found — or everything found is already in the catalog.");
    return undefined;
  }

  const byCommandId = new Map(candidates.map((c) => [c.commandId, c]));
  const entries: LiteralPickEntry[] = candidates.map((c) => ({
    id: c.commandId,
    label: c.displayName,
    description: c.commandId,
    detail: `${c.sourceExtensionDisplayName}${DETAIL_SEPARATOR}${formatCategoryLabel(c.groupName, c.subGroupName)}`,
  }));

  const picked = await showLiteralMultiSelectQuickPick(entries, {
    title: "Select commands to import",
    placeHolder: `${candidates.length} commands — type to search by name, command id, extension, or category`,
  });

  return picked?.map((id) => byCommandId.get(id)!);
}

export async function runImportFlow(): Promise<void> {
  const config = getConfig();

  const extensionIds = await promptForSourceExtensions(config);

  const effectiveConfig: ImporterConfig = { ...config, sourceExtensionFilters: extensionIds };
  const candidates = await discoverCandidates(effectiveConfig);

  const { catalogPath, catalog } = readCurrentCatalog();
  const availableCandidates = excludeAlreadyCataloged(
    candidates,
    catalog.map((e) => e.actionName)
  );

  const selected = await pickCandidates(availableCandidates);
  if (!selected || selected.length === 0) {
    return;
  }

  const result = performImport({
    catalogPath,
    candidates: selected,
    selectedByDefault: config.selectedByDefault,
  });

  vscode.window.showInformationMessage(
    withBackupNote(
      withRefreshReminder(
        `Import complete. Added: ${result.added.length}, duplicates skipped: ${result.duplicates.length}.`,
        result.added.length > 0
      ),
      result.backupPath
    )
  );
}
