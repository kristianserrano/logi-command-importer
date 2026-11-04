import * as vscode from "vscode";
import { computeFindReplaceChanges, formatChangePreview, FindReplaceScope } from "../findReplace";
import { formatCategoryLabel, pluralizeEntries, withBackupNote, withRefreshReminder } from "../formatting";
import { performFindReplace } from "../importService";
import { LiteralPickEntry, showLiteralMultiSelectQuickPick } from "../quickPick";
import { readCurrentCatalog } from "./shared";

/**
 * A one-off bulk cleanup for what's already in the catalog — e.g. stripping a redundant
 * "My Extension: " prefix that many of an extension's commands happen to share — as distinct from
 * `displayNameFindReplace`/`groupNameFindReplace`, which only affect *future* imports. Scoped to
 * `displayName`/`groupName` (shown to users as Display Name / Category) specifically (never `actionName`, which Logi correlates to a real
 * command and must stay exact), and every affected entry is shown with its old → new value
 * before anything is written, all pre-checked but individually removable, with the usual backup.
 */
export async function runFindReplaceFlow(): Promise<void> {
  const scopeChoice = await vscode.window.showQuickPick(
    [
      { label: "Display Name", value: "displayName" as FindReplaceScope },
      { label: "Category", value: "groupName" as FindReplaceScope },
      { label: "Both", value: "both" as FindReplaceScope },
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

  const { catalogPath, catalog } = readCurrentCatalog();
  if (catalog.length === 0) {
    vscode.window.showInformationMessage("The catalog is empty — nothing to change.");
    return;
  }

  const changes = computeFindReplaceChanges(catalog, { [findText]: replaceText }, scopeChoice.value);
  if (changes.length === 0) {
    vscode.window.showInformationMessage(`No entries contain "${findText}" in the selected field(s).`);
    return;
  }

  const byActionName = new Map(catalog.map((e) => [e.actionName, e]));
  const entries: LiteralPickEntry[] = changes.map((change) => {
    const entry = byActionName.get(change.actionName)!;
    return {
      id: change.actionName,
      label: formatChangePreview(entry, change),
      description: change.actionName,
      detail: formatCategoryLabel(entry.groupName, entry.subGroupName),
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
    withBackupNote(
      withRefreshReminder(`Updated ${pluralizeEntries(result.updated.length)}.`, result.updated.length > 0),
      result.backupPath
    )
  );
}
