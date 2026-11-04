import * as assert from "assert";
import { formatCategoryLabel, pluralizeEntries, withBackupNote, withRefreshReminder } from "../../formatting";

describe("formatting", () => {
  it("formatCategoryLabel joins category and subcategory", () => {
    assert.strictEqual(formatCategoryLabel("G", "Sub"), "G / Sub");
    assert.strictEqual(formatCategoryLabel("G", null), "G");
    assert.strictEqual(formatCategoryLabel("G", ""), "G");
    assert.strictEqual(formatCategoryLabel("G", undefined), "G");
  });

  it("pluralizeEntries handles singular, plural, and zero", () => {
    assert.strictEqual(pluralizeEntries(1), "1 entry");
    assert.strictEqual(pluralizeEntries(0), "0 entries");
    assert.strictEqual(pluralizeEntries(3), "3 entries");
  });

  it("withRefreshReminder appends only when the catalog changed", () => {
    assert.ok(withRefreshReminder("Done.", true).startsWith("Done. Click Refresh"));
    assert.strictEqual(withRefreshReminder("Done.", false), "Done.");
  });

  it("withBackupNote appends only when a backup path exists", () => {
    assert.strictEqual(withBackupNote("Done.", "/tmp/b.bak"), "Done. Backup: /tmp/b.bak");
    assert.strictEqual(withBackupNote("Done.", null), "Done.");
    assert.strictEqual(withBackupNote("Done.", undefined), "Done.");
  });
});
