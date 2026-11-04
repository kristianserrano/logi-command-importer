import * as vscode from "vscode";
import { buildSearchText, matchesLiteralQuery } from "./literalFilter";

export interface LiteralPickEntry {
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
export async function showLiteralMultiSelectQuickPick(
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
    // matched via description/detail (e.g. actionName or category name containing the query) would
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

    // NOTE (unverified risk): reassigning `quickPick.items` and `quickPick.selectedItems` below
    // may itself fire `onDidChangeSelection`, and VS Code can emit a selection change for the
    // narrowed list before `selectedItems` is restored. The handler above keeps checks for items
    // that are *not* visible, but if an event ever reports an empty selection before
    // `selectedItems` is restored, it would drop the checks on *visible* items. Whether that
    // actually happens has not been verified without a live VS Code host. Smoke test in the Extension Development
    // Host: check several items, type a filter, clear the filter, and confirm every previously
    // checked item is still checked (including ones hidden while filtering), then accept and
    // confirm the full set is returned.
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
