import * as vscode from "vscode";
import { formatCategoryLabel, pluralizeEntries, withBackupNote, withRefreshReminder } from "../formatting";
import { performRemoval } from "../importService";
import { LiteralPickEntry, showLiteralMultiSelectQuickPick } from "../quickPick";
import { readCurrentCatalog } from "./shared";

export async function runRemoveFlow(): Promise<void> {
  const { catalogPath, catalog } = readCurrentCatalog();

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
    detail: formatCategoryLabel(e.groupName, e.subGroupName),
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
    withBackupNote(
      withRefreshReminder(`Removed ${pluralizeEntries(result.removed.length)}.`, result.removed.length > 0),
      result.backupPath
    )
  );
}
