import * as fs from "fs";
import * as path from "path";
import { CatalogEntry } from "./types";

/** How many timestamped backups to keep next to the catalog; older ones are deleted after each write. */
export const MAX_BACKUPS = 10;

/** Reads the catalog; returns an empty list if the file is missing or blank, and throws if it is not a JSON array. */
export function readCatalog(catalogPath: string): CatalogEntry[] {
  if (!fs.existsSync(catalogPath)) {
    return [];
  }
  const raw = fs.readFileSync(catalogPath, "utf8").trim();
  if (raw.length === 0) {
    return [];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Catalog at ${catalogPath} is not a JSON array.`);
  }
  return parsed as CatalogEntry[];
}

/** Writes the catalog, creating the parent directory and a timestamped backup (if the file exists) first. */
export function writeCatalog(catalogPath: string, entries: CatalogEntry[]): { backupPath: string | null } {
  const dir = path.dirname(catalogPath);
  fs.mkdirSync(dir, { recursive: true });

  let backupPath: string | null = null;
  if (fs.existsSync(catalogPath)) {
    backupPath = backupFilePath(catalogPath);
    fs.copyFileSync(catalogPath, backupPath);
    pruneBackups(catalogPath);
  }

  fs.writeFileSync(catalogPath, JSON.stringify(entries, null, 2) + "\n", "utf8");
  return { backupPath };
}

/** Builds a timestamped sibling path, e.g. logiActions.backup-2026-01-01T00-00-00-000Z.json. */
function backupFilePath(catalogPath: string, now: Date = new Date()): string {
  const dir = path.dirname(catalogPath);
  const ext = path.extname(catalogPath);
  const base = path.basename(catalogPath, ext);
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return path.join(dir, `${base}.backup-${stamp}${ext}`);
}

/**
 * Deletes all but the newest MAX_BACKUPS backups of this catalog. Only files matching this
 * module's own backup naming (`<name>.backup-<timestamp><ext>`) are considered, so nothing else in
 * the folder can be touched. The ISO timestamp makes name order chronological. A file that can't
 * be deleted is left alone; pruning never fails a write.
 */
function pruneBackups(catalogPath: string): void {
  const dir = path.dirname(catalogPath);
  const ext = path.extname(catalogPath);
  const base = path.basename(catalogPath, ext);
  const pattern = new RegExp(`^${escapeRegExp(base)}\\.backup-\\d{4}-\\d{2}-\\d{2}T[\\d-]+Z${escapeRegExp(ext)}$`);
  const backups = fs.readdirSync(dir).filter((name) => pattern.test(name)).sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      // best effort
    }
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Writes the catalog only when `changed` is true; returns the backup path (null if no write happened
 * or there was no prior file to back up).
 */
export function writeCatalogIfChanged(
  catalogPath: string,
  entries: CatalogEntry[],
  changed: boolean
): { backupPath: string | null } {
  return changed ? writeCatalog(catalogPath, entries) : { backupPath: null };
}

/**
 * Merges new entries into the existing catalog, preserving all existing entries and skipping
 * any new entry whose actionName already exists (case-sensitive, matching Logi's own semantics).
 */
export function mergeEntries(
  existing: CatalogEntry[],
  additions: CatalogEntry[]
): { merged: CatalogEntry[]; added: CatalogEntry[]; duplicates: string[] } {
  const existingNames = new Set(existing.map((e) => e.actionName));
  const added: CatalogEntry[] = [];
  const duplicates: string[] = [];
  const merged = [...existing];

  for (const entry of additions) {
    if (existingNames.has(entry.actionName)) {
      duplicates.push(entry.actionName);
      continue;
    }
    merged.push(entry);
    existingNames.add(entry.actionName);
    added.push(entry);
  }

  return { merged, added, duplicates };
}

/** Removes entries with the given actionNames, preserving everything else. */
export function removeEntries(
  existing: CatalogEntry[],
  actionNamesToRemove: string[]
): { merged: CatalogEntry[]; removed: string[] } {
  const toRemove = new Set(actionNamesToRemove);
  const removed: string[] = [];
  const merged = existing.filter((entry) => {
    if (toRemove.has(entry.actionName)) {
      removed.push(entry.actionName);
      return false;
    }
    return true;
  });
  return { merged, removed };
}
