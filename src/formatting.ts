import { CATEGORY_SEPARATOR } from "./constants";

/** "Category" or "Category / Subcategory" — how a catalog entry's groupName/subGroupName are shown in the UI. */
export function formatCategoryLabel(groupName: string, subGroupName: string | null | undefined): string {
  return `${groupName}${subGroupName ? CATEGORY_SEPARATOR + subGroupName : ""}`;
}

/** "1 entry" / "2 entries". */
export function pluralizeEntries(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

/**
 * Appends a reminder to refresh Logi Command Manager when the catalog file was changed. Logi reads
 * the file only on activation and on its Refresh button, and writes its in-memory copy back on its
 * next edit, so an unrefreshed edit there would overwrite this change.
 */
export function withRefreshReminder(message: string, catalogChanged: boolean): string {
  return catalogChanged ? `${message} Click Refresh in Logi Command Manager to see the change.` : message;
}

/** Appends " Backup: <path>" to a result message when a backup file was written. */
export function withBackupNote(message: string, backupPath: string | null | undefined): string {
  return message + (backupPath ? ` Backup: ${backupPath}` : "");
}
