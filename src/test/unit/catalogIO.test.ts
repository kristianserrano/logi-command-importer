import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { catalogExists, mergeEntries, readCatalog, removeEntries, writeCatalog } from "../../catalogIO";
import { CatalogEntry } from "../../types";

function tempCatalogPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logi-catalog-test-"));
  return path.join(dir, "logiActions.json");
}

const sampleEntry: CatalogEntry = {
  selected: true,
  actionName: "git.commit",
  groupName: "Git",
  displayName: "Commit",
  subGroupName: null,
};

describe("catalogIO", () => {
  describe("readCatalog", () => {
    it("returns an empty array when the catalog file does not exist", () => {
      const catalogPath = tempCatalogPath();
      assert.deepStrictEqual(readCatalog(catalogPath), []);
    });

    it("reads back entries previously written", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [sampleEntry]);
      assert.deepStrictEqual(readCatalog(catalogPath), [sampleEntry]);
    });

    it("throws if the catalog file does not contain a JSON array", () => {
      const catalogPath = tempCatalogPath();
      fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
      fs.writeFileSync(catalogPath, JSON.stringify({ not: "an array" }));
      assert.throws(() => readCatalog(catalogPath));
    });
  });

  describe("writeCatalog", () => {
    it("creates the parent directory if it does not exist", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logi-catalog-test-"));
      const catalogPath = path.join(dir, "nested", "logiActions.json");
      writeCatalog(catalogPath, [sampleEntry]);
      assert.ok(fs.existsSync(catalogPath));
    });

    it("creates a timestamped backup when overwriting an existing catalog", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [sampleEntry]);
      const { backupPath } = writeCatalog(catalogPath, [sampleEntry, { ...sampleEntry, actionName: "git.push" }]);

      assert.ok(backupPath);
      assert.ok(fs.existsSync(backupPath!));
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(backupPath!, "utf8")), [sampleEntry]);
    });

    it("does not create a backup on the first write (no prior file)", () => {
      const catalogPath = tempCatalogPath();
      const { backupPath } = writeCatalog(catalogPath, [sampleEntry]);
      assert.strictEqual(backupPath, null);
    });
  });

  describe("catalogExists", () => {
    it("reflects whether the catalog file is present", () => {
      const catalogPath = tempCatalogPath();
      assert.strictEqual(catalogExists(catalogPath), false);
      writeCatalog(catalogPath, [sampleEntry]);
      assert.strictEqual(catalogExists(catalogPath), true);
    });
  });

  describe("mergeEntries", () => {
    it("preserves all existing entries and appends new, non-duplicate ones", () => {
      const additional: CatalogEntry = { ...sampleEntry, actionName: "git.push", displayName: "Push" };
      const { merged, added, duplicates } = mergeEntries([sampleEntry], [additional]);
      assert.deepStrictEqual(merged, [sampleEntry, additional]);
      assert.deepStrictEqual(added, [additional]);
      assert.deepStrictEqual(duplicates, []);
    });

    it("skips entries whose actionName already exists in the catalog", () => {
      const duplicate: CatalogEntry = { ...sampleEntry, displayName: "Different label, same action" };
      const { merged, added, duplicates } = mergeEntries([sampleEntry], [duplicate]);
      assert.deepStrictEqual(merged, [sampleEntry]);
      assert.deepStrictEqual(added, []);
      assert.deepStrictEqual(duplicates, ["git.commit"]);
    });
  });

  describe("removeEntries", () => {
    it("removes only the entries whose actionName matches, preserving the rest", () => {
      const other: CatalogEntry = { ...sampleEntry, actionName: "git.push", displayName: "Push" };
      const { merged, removed } = removeEntries([sampleEntry, other], ["git.commit"]);
      assert.deepStrictEqual(merged, [other]);
      assert.deepStrictEqual(removed, ["git.commit"]);
    });

    it("reports nothing removed when no actionName matches", () => {
      const { merged, removed } = removeEntries([sampleEntry], ["not.present"]);
      assert.deepStrictEqual(merged, [sampleEntry]);
      assert.deepStrictEqual(removed, []);
    });
  });
});
