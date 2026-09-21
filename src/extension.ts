import * as vscode from "vscode";
import * as os from "os";
import { isSupportedPlatform, resolveCatalogPath } from "./catalogPaths";
import { readCatalog } from "./catalogIO";
import { mergeConfig } from "./config";
import { buildCandidates, excludeAlreadyCataloged } from "./candidates";
import { discoverManifestCommands, discoverViewOwnership, hasDeclaredCommands, mergeRegistryCommands } from "./discovery";
import { applyFindReplaceRules, parseLineDelimitedPairs } from "./findReplace";
import { performFindReplace, performImport, performRemoval } from "./importService";
import { buildSearchText, matchesLiteralQuery } from "./literalFilter";
import { CandidateEntry, ImporterConfig } from "./types";

const CONFIG_SECTION = "logiCommandImporter";

function getConfig(): ImporterConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return mergeConfig({
    namespacePrefixes: cfg.get("namespacePrefixes"),
    displayNameOverrides: cfg.get("displayNameOverrides"),
    groupNameOverrides: cfg.get("groupNameOverrides"),
    subGroupRules: parseLineDelimitedPairs(cfg.get<string>("subGroupRules") ?? ""),
    sourceExtensionFilters: cfg.get("sourceExtensionFilters"),
    selectedByDefault: cfg.get("selectedByDefault"),
    displayNameFindReplace: parseLineDelimitedPairs(cfg.get<string>("displayNameFindReplace") ?? ""),
    groupNameFindReplace: parseLineDelimitedPairs(cfg.get<string>("groupNameFindReplace") ?? ""),
  });
}

function getCatalogPath(): string {
  const platform = process.platform;
  if (!isSupportedPlatform(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return resolveCatalogPath({
    platform,
    homedir: os.homedir(),
    appData: process.env.APPDATA,
  });
}

async function discoverCandidates(config: ImporterConfig): Promise<CandidateEntry[]> {
  const extensions = vscode.extensions.all.map((e) => ({ id: e.id, packageJSON: e.packageJSON }));
  const manifestCommands = discoverManifestCommands(extensions);
  const viewOwnership = discoverViewOwnership(extensions);
  const registryCommandIds = await vscode.commands.getCommands(true);
  const merged = mergeRegistryCommands(manifestCommands, registryCommandIds, viewOwnership);
  return buildCandidates(merged, config);
}

interface LiteralPickEntry {
  id: string;
  label: string;
  description?: string;
  detail?: string;
  picked?: boolean;
}

/**
 * A multi-select Quick Pick that filters by literal, case-insensitive substring across label,
 * description, and detail as you type — not VS Code's default fuzzy subsequence matching, which
 * is dangerously permissive for this kind of list (see literalFilter.ts). Returns the ids of
 * whatever ended up checked when accepted (possibly none), or undefined if dismissed via Escape
 * without accepting.
 */
async function showLiteralMultiSelectQuickPick(
  entries: LiteralPickEntry[],
  options: { title: string; placeHolder: string }
): Promise<string[] | undefined> {
  interface Item extends vscode.QuickPickItem {
    id: string;
  }

  const allItems: Item[] = entries.map((e) => ({
    label: e.label,
    description: e.description,
    detail: e.detail,
    id: e.id,
  }));
  const searchTextById = new Map(entries.map((e) => [e.id, buildSearchText([e.label, e.description, e.detail])]));

  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<Item>();
    quickPick.title = options.title;
    quickPick.placeholder = options.placeHolder;
    quickPick.canSelectMany = true;
    quickPick.ignoreFocusOut = true;
    // createQuickPick applies its own built-in (fuzzy) filter on top of whatever .items we
    // assign, using .value — it doesn't defer to us just because we reassign .items ourselves.
    // By default that built-in filter only checks label, so without these, an item we correctly
    // matched via description/detail (e.g. actionName or group name containing the query) would
    // get hidden again by VS Code's own pass, which only ever saw the label. Enabling both is
    // safe: by the time it runs, .items is already narrowed to our literal matches, and a literal
    // substring match is always also a valid fuzzy match, so this can only ever keep those items.
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = allItems;

    let checked = new Set(entries.filter((e) => e.picked).map((e) => e.id));
    quickPick.selectedItems = allItems.filter((item) => checked.has(item.id));

    quickPick.onDidChangeSelection((selection) => {
      const visibleIds = new Set(quickPick.items.map((item) => item.id));
      const checkedButNotVisible = [...checked].filter((id) => !visibleIds.has(id));
      checked = new Set([...checkedButNotVisible, ...selection.map((item) => item.id)]);
    });

    quickPick.onDidChangeValue((value) => {
      const filtered = allItems.filter((item) => matchesLiteralQuery(searchTextById.get(item.id) ?? "", value));
      quickPick.items = filtered;
      quickPick.selectedItems = filtered.filter((item) => checked.has(item.id));
    });

    let accepted = false;
    quickPick.onDidAccept(() => {
      accepted = true;
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve(accepted ? [...checked] : undefined);
    });
    quickPick.show();
  });
}

/**
 * Optionally scope discovery to specific extensions. Left blank (confirm with nothing checked,
 * or Escape — treated the same), every discovered command becomes a candidate instead, and the
 * next step's Quick Pick — which already searches label, command id, and detail as you type — is
 * what narrows it down, the same way VS Code's own Command Palette works over every command
 * without requiring a filter to be picked first. A configured `namespacePrefixes` setting still
 * always adds its own matches on top of whatever's picked here.
 *
 * Only extensions that declare at least one command are listed — themes, keymaps, and other
 * command-less extensions have nothing to offer here (see hasDeclaredCommands).
 */
async function promptForSourceExtensions(config: ImporterConfig): Promise<string[]> {
  const preselected = new Set(config.sourceExtensionFilters);
  const entries: LiteralPickEntry[] = vscode.extensions.all
    .filter((e) => hasDeclaredCommands({ id: e.id, packageJSON: e.packageJSON }))
    .map((e) => ({
      id: e.id,
      label: (e.packageJSON.displayName as string | undefined) ?? (e.packageJSON.name as string | undefined) ?? e.id,
      description: e.id,
      picked: preselected.has(e.id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const picked = await showLiteralMultiSelectQuickPick(entries, {
    title: "Import commands from which extensions? (optional)",
    placeHolder: "Check one or more extensions — or press Enter with none checked to search every command instead",
  });

  return picked ?? [];
}

async function pickCandidates(
  candidates: CandidateEntry[]
): Promise<CandidateEntry[] | undefined> {
  if (candidates.length === 0) {
    vscode.window.showInformationMessage("No commands were found — or everything found is already in the catalog.");
    return undefined;
  }

  const byCommandId = new Map(candidates.map((c) => [c.commandId, c]));
  const entries: LiteralPickEntry[] = candidates.map((c) => ({
    id: c.commandId,
    label: c.displayName,
    description: c.commandId,
    detail: `${c.sourceExtensionDisplayName} · ${c.groupName}${c.subGroupName ? " / " + c.subGroupName : ""}`,
  }));

  const picked = await showLiteralMultiSelectQuickPick(entries, {
    title: "Select commands to import into the Logi Command Manager catalog",
    placeHolder: `${candidates.length} commands — type to search by name, command id, or extension`,
  });

  return picked?.map((id) => byCommandId.get(id)!);
}

async function runImportFlow(): Promise<void> {
  const config = getConfig();

  const extensionIds = await promptForSourceExtensions(config);

  const effectiveConfig: ImporterConfig = { ...config, sourceExtensionFilters: extensionIds };
  const candidates = await discoverCandidates(effectiveConfig);

  const catalogPath = getCatalogPath();
  const existingActionNames = readCatalog(catalogPath).map((e) => e.actionName);
  const availableCandidates = excludeAlreadyCataloged(candidates, existingActionNames);

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
    `Import complete. Added: ${result.added.length}, duplicates skipped: ${result.duplicates.length}.` +
      (result.backupPath ? ` Backup: ${result.backupPath}` : "")
  );
}

async function runRemoveFlow(): Promise<void> {
  const catalogPath = getCatalogPath();
  const catalog = readCatalog(catalogPath);

  if (catalog.length === 0) {
    vscode.window.showInformationMessage("The catalog is empty — nothing to remove.");
    return;
  }

  // Every catalog entry can be selected for removal — Logi's own Command Manager UI already
  // lets you add/remove/edit any entry directly, so restricting this flow to entries this
  // extension itself imported wouldn't actually protect anything, just add friction. Anything
  // removed by mistake can simply be re-added (via this extension's import flow, or in Logi
  // Options+ directly). The safety net is explicit selection plus a backup before every write,
  // not an origin check.
  const entries: LiteralPickEntry[] = catalog.map((e) => ({
    id: e.actionName,
    label: e.displayName,
    description: e.actionName,
    detail: `${e.groupName}${e.subGroupName ? " / " + e.subGroupName : ""}`,
  }));

  const picked = await showLiteralMultiSelectQuickPick(entries, {
    title: "Select commands to remove from the Logi Command Manager catalog",
    placeHolder: `${catalog.length} catalog entries`,
  });

  if (!picked || picked.length === 0) {
    return;
  }

  const result = performRemoval(catalogPath, picked);

  vscode.window.showInformationMessage(
    `Removed ${result.removed.length} entr${result.removed.length === 1 ? "y" : "ies"}.` +
      (result.backupPath ? ` Backup: ${result.backupPath}` : "")
  );
}

/**
 * A one-off bulk cleanup for what's already in the catalog — e.g. stripping a redundant
 * "Claude Code: " prefix that many of an extension's commands happen to share — as distinct from
 * `displayNameFindReplace`/`groupNameFindReplace`, which only affect *future* imports. Scoped to
 * `displayName`/`groupName` specifically (never `actionName`, which Logi correlates to a real
 * command and must stay exact), and every affected entry is shown with its old → new value
 * before anything is written, all pre-checked but individually removable, with the usual backup.
 */
async function runFindReplaceFlow(): Promise<void> {
  const scopeChoice = await vscode.window.showQuickPick(
    [
      { label: "Display Name", value: "displayName" as const },
      { label: "Group Name", value: "groupName" as const },
      { label: "Both", value: "both" as const },
    ],
    { title: "Find and replace in which field?", ignoreFocusOut: true }
  );
  if (!scopeChoice) {
    return;
  }

  const findText = await vscode.window.showInputBox({
    title: "Find",
    prompt: "Text to find (a literal match, not a regular expression)",
    ignoreFocusOut: true,
  });
  if (findText === undefined) {
    return;
  }
  if (findText.length === 0) {
    vscode.window.showWarningMessage("Find text cannot be empty.");
    return;
  }

  const replaceText = await vscode.window.showInputBox({
    title: "Replace",
    prompt: "Replacement text — leave blank to remove the found text entirely",
    ignoreFocusOut: true,
  });
  if (replaceText === undefined) {
    return;
  }

  const catalogPath = getCatalogPath();
  const catalog = readCatalog(catalogPath);
  if (catalog.length === 0) {
    vscode.window.showInformationMessage("The catalog is empty — nothing to change.");
    return;
  }

  const rule = { [findText]: replaceText };
  const scopesDisplayName = scopeChoice.value === "both" || scopeChoice.value === "displayName";
  const scopesGroupName = scopeChoice.value === "both" || scopeChoice.value === "groupName";

  interface Change {
    actionName: string;
    newDisplayName?: string;
    newGroupName?: string;
  }
  const changes: Change[] = [];
  for (const entry of catalog) {
    const newDisplayName = scopesDisplayName ? applyFindReplaceRules(entry.displayName, rule) : entry.displayName;
    const newGroupName = scopesGroupName ? applyFindReplaceRules(entry.groupName, rule) : entry.groupName;
    const displayChanged = newDisplayName !== entry.displayName;
    const groupChanged = newGroupName !== entry.groupName;
    if (!displayChanged && !groupChanged) {
      continue;
    }
    changes.push({
      actionName: entry.actionName,
      newDisplayName: displayChanged ? newDisplayName : undefined,
      newGroupName: groupChanged ? newGroupName : undefined,
    });
  }

  if (changes.length === 0) {
    vscode.window.showInformationMessage(`No entries contain "${findText}" in the selected field(s).`);
    return;
  }

  const byActionName = new Map(catalog.map((e) => [e.actionName, e]));
  const entries: LiteralPickEntry[] = changes.map((change) => {
    const entry = byActionName.get(change.actionName)!;
    const parts: string[] = [];
    if (change.newDisplayName !== undefined) {
      parts.push(`"${entry.displayName}" → "${change.newDisplayName}"`);
    }
    if (change.newGroupName !== undefined) {
      parts.push(`group: "${entry.groupName}" → "${change.newGroupName}"`);
    }
    return {
      id: change.actionName,
      label: parts.join("   "),
      description: change.actionName,
      detail: `${entry.groupName}${entry.subGroupName ? " / " + entry.subGroupName : ""}`,
      picked: true,
    };
  });

  const picked = await showLiteralMultiSelectQuickPick(entries, {
    title: "Review changes before applying",
    placeHolder: `${changes.length} entries would change — uncheck any you want to leave alone`,
  });
  if (!picked || picked.length === 0) {
    return;
  }

  const pickedSet = new Set(picked);
  const updates = changes
    .filter((change) => pickedSet.has(change.actionName))
    .map((change) => ({
      actionName: change.actionName,
      displayName: change.newDisplayName,
      groupName: change.newGroupName,
    }));

  const result = performFindReplace(catalogPath, updates);

  vscode.window.showInformationMessage(
    `Updated ${result.updated.length} entr${result.updated.length === 1 ? "y" : "ies"}.` +
      (result.backupPath ? ` Backup: ${result.backupPath}` : "")
  );
}

async function runOpenCatalog(): Promise<void> {
  const catalogPath = getCatalogPath();
  const uri = vscode.Uri.file(catalogPath);
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch {
    vscode.window.showWarningMessage(`No Logi catalog file found yet at: ${catalogPath}`);
  }
}

async function runConfigureSources(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openSettings", CONFIG_SECTION);
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("logiCommandImporter.importNamespacedCommands", runImportFlow),
    vscode.commands.registerCommand("logiCommandImporter.removeImportedCommands", runRemoveFlow),
    vscode.commands.registerCommand("logiCommandImporter.findReplaceInCatalog", runFindReplaceFlow),
    vscode.commands.registerCommand("logiCommandImporter.openActiveCatalog", runOpenCatalog),
    vscode.commands.registerCommand("logiCommandImporter.configureCommandSources", runConfigureSources)
  );
}

export function deactivate(): void {
  // no-op
}
