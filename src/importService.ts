import { CandidateEntry, CatalogEntry, ImportOutcome } from "./types";
import { mergeEntries, readCatalog, removeEntries, writeCatalog } from "./catalogIO";

export interface ImportRequest {
  catalogPath: string;
  candidates: CandidateEntry[];
  selectedByDefault: boolean;
}

export interface ImportResult extends ImportOutcome {
  backupPath: string | null;
}

export function performImport(request: ImportRequest): ImportResult {
  const existing = readCatalog(request.catalogPath);
  const toAddEntries: CatalogEntry[] = request.candidates.map((candidate) => ({
    selected: request.selectedByDefault,
    actionName: candidate.commandId,
    groupName: candidate.groupName,
    displayName: candidate.displayName,
    subGroupName: candidate.subGroupName,
  }));

  const { merged, added, duplicates } = mergeEntries(existing, toAddEntries);
  const { backupPath } = writeCatalog(request.catalogPath, merged);

  return {
    added,
    skipped: [],
    duplicates,
    failed: [],
    backupPath,
  };
}

export interface RemovalResult {
  removed: string[];
  notFound: string[];
  backupPath: string | null;
}

/**
 * Removes whichever of the given actionNames are actually present in the catalog, regardless of
 * whether this extension imported them. Nothing is removed unless it was explicitly requested
 * (i.e. selected by the user), and a timestamped backup is taken before the write — that
 * explicit-selection-plus-backup pairing is the safety net, not an origin check.
 */
export function performRemoval(catalogPath: string, actionNamesToRemove: string[]): RemovalResult {
  const existing = readCatalog(catalogPath);
  const { merged, removed } = removeEntries(existing, actionNamesToRemove);
  const removedSet = new Set(removed);
  const notFound = actionNamesToRemove.filter((name) => !removedSet.has(name));

  let backupPath: null | string = null;
  if (removed.length > 0) {
    ({ backupPath } = writeCatalog(catalogPath, merged));
  }

  return { removed, notFound, backupPath };
}

export interface FindReplaceUpdate {
  actionName: string;
  /** New displayName, if this update should change it. Omit to leave displayName untouched. */
  displayName?: string;
  /** New groupName, if this update should change it. Omit to leave groupName untouched. */
  groupName?: string;
}

export interface FindReplaceResult {
  updated: string[];
  backupPath: string | null;
}

/**
 * Applies pre-computed display/group name updates to whichever catalog entries were explicitly
 * selected (the caller — the "Find and Replace in Catalog" command — computes the new values via
 * findReplace.ts and shows them in a preview before this ever runs). An entry whose update
 * produces no actual change (e.g. selected but the text didn't contain the find string) isn't
 * counted as updated or written. A timestamped backup is taken before the write, only if
 * something is actually changing.
 */
export function performFindReplace(catalogPath: string, updates: FindReplaceUpdate[]): FindReplaceResult {
  const existing = readCatalog(catalogPath);
  const updateByActionName = new Map(updates.map((u) => [u.actionName, u]));

  const updated: string[] = [];
  const merged = existing.map((entry) => {
    const update = updateByActionName.get(entry.actionName);
    if (!update) {
      return entry;
    }
    const newDisplayName = update.displayName ?? entry.displayName;
    const newGroupName = update.groupName ?? entry.groupName;
    if (newDisplayName === entry.displayName && newGroupName === entry.groupName) {
      return entry;
    }
    updated.push(entry.actionName);
    return { ...entry, displayName: newDisplayName, groupName: newGroupName };
  });

  let backupPath: null | string = null;
  if (updated.length > 0) {
    ({ backupPath } = writeCatalog(catalogPath, merged));
  }

  return { updated, backupPath };
}
