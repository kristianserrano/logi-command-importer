import * as fs from "fs";
import * as path from "path";
import { CatalogEntry } from "./types";

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
  }

  fs.writeFileSync(catalogPath, JSON.stringify(entries, null, 2) + "\n", "utf8");
  return { backupPath };
}

export function backupFilePath(catalogPath: string, now: Date = new Date()): string {
  const dir = path.dirname(catalogPath);
  const ext = path.extname(catalogPath);
  const base = path.basename(catalogPath, ext);
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return path.join(dir, `${base}.backup-${stamp}${ext}`);
}

export function catalogExists(catalogPath: string): boolean {
  return fs.existsSync(catalogPath);
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
