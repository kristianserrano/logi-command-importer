import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { performFindReplace, performImport, performRemoval } from "../../importService";
import { readCatalog, writeCatalog } from "../../catalogIO";
import { CandidateEntry, CatalogEntry } from "../../types";

function tempCatalogPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logi-import-service-test-"));
  return path.join(dir, "logiActions.json");
}

const preexisting: CatalogEntry = {
  selected: true,
  actionName: "user.existingAction",
  groupName: "User Group",
  displayName: "Existing Action",
  subGroupName: null,
};

const candidate: CandidateEntry = {
  commandId: "git.commit",
  sourceExtensionId: "vscode.git",
  sourceExtensionDisplayName: "Git",
  displayName: "Commit",
  groupName: "Git",
  subGroupName: null,
};

describe("importService", () => {
  describe("performImport", () => {
    it("preserves existing entries, adds new ones, and backs up the catalog", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [preexisting]);

      const result = performImport({
        catalogPath,
        candidates: [candidate],
        selectedByDefault: true,
      });

      assert.strictEqual(result.added.length, 1);
      assert.ok(result.backupPath && fs.existsSync(result.backupPath));

      const catalog = readCatalog(catalogPath);
      assert.strictEqual(catalog.length, 2);
      assert.ok(catalog.some((e) => e.actionName === "user.existingAction"));
      assert.ok(catalog.some((e) => e.actionName === "git.commit"));
    });

    it("honors selectedByDefault when building new entries", () => {
      const catalogPath = tempCatalogPath();
      const result = performImport({
        catalogPath,
        candidates: [candidate],
        selectedByDefault: false,
      });
      assert.strictEqual(result.added[0].selected, false);
    });

    it("skips duplicates against the existing catalog and does not re-add them", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [preexisting]);
      const dupCandidate: CandidateEntry = { ...candidate, commandId: "user.existingAction" };

      const result = performImport({
        catalogPath,
        candidates: [dupCandidate],
        selectedByDefault: true,
      });

      assert.deepStrictEqual(result.duplicates, ["user.existingAction"]);
      assert.strictEqual(result.added.length, 0);
      assert.strictEqual(readCatalog(catalogPath).length, 1);
    });
  });

  describe("performRemoval", () => {
    it("removes any explicitly requested catalog entry, regardless of whether this extension imported it", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [preexisting]);
      performImport({
        catalogPath,
        candidates: [candidate],
        selectedByDefault: true,
      });

      const result = performRemoval(catalogPath, ["git.commit", "user.existingAction"]);

      assert.deepStrictEqual(result.removed.sort(), ["git.commit", "user.existingAction"]);
      assert.deepStrictEqual(result.notFound, []);
      assert.strictEqual(readCatalog(catalogPath).length, 0);
    });

    it("leaves entries untouched that weren't explicitly requested", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [preexisting]);
      performImport({
        catalogPath,
        candidates: [candidate],
        selectedByDefault: true,
      });

      performRemoval(catalogPath, ["user.existingAction"]);

      const catalog = readCatalog(catalogPath);
      assert.deepStrictEqual(
        catalog.map((e) => e.actionName),
        ["git.commit"]
      );
    });

    it("reports requested action names that don't exist in the catalog as not found", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [preexisting]);

      const result = performRemoval(catalogPath, ["does.not.exist"]);
      assert.deepStrictEqual(result.removed, []);
      assert.deepStrictEqual(result.notFound, ["does.not.exist"]);
    });

    it("creates a backup only when something was actually removed", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [preexisting]);

      const result = performRemoval(catalogPath, ["nothing.there"]);
      assert.strictEqual(result.removed.length, 0);
      assert.strictEqual(result.backupPath, null);
    });
  });

  describe("performFindReplace", () => {
    const claudeEntry: CatalogEntry = {
      selected: true,
      actionName: "claude-vscode.acceptProposedHunkFromBar",
      groupName: "Claude Code for VS Code",
      displayName: "Claude Code: Accept this change",
      subGroupName: null,
    };

    it("applies pre-computed displayName/groupName updates only to explicitly selected entries, with a backup", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [preexisting, claudeEntry]);

      const result = performFindReplace(catalogPath, [
        { actionName: claudeEntry.actionName, displayName: "Accept this change" },
      ]);

      assert.deepStrictEqual(result.updated, [claudeEntry.actionName]);
      assert.ok(result.backupPath && fs.existsSync(result.backupPath));

      const catalog = readCatalog(catalogPath);
      const updated = catalog.find((e) => e.actionName === claudeEntry.actionName);
      assert.strictEqual(updated?.displayName, "Accept this change");
      const untouched = catalog.find((e) => e.actionName === preexisting.actionName);
      assert.strictEqual(untouched?.displayName, preexisting.displayName);
    });

    it("updates groupName independently of displayName", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [claudeEntry]);

      performFindReplace(catalogPath, [{ actionName: claudeEntry.actionName, groupName: "Claude Code" }]);

      const catalog = readCatalog(catalogPath);
      assert.strictEqual(catalog[0].groupName, "Claude Code");
      assert.strictEqual(catalog[0].displayName, claudeEntry.displayName);
    });

    it("does not count or write an update that produces no actual change", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [claudeEntry]);
      const beforeMtime = fs.statSync(catalogPath).mtimeMs;

      const result = performFindReplace(catalogPath, [
        { actionName: claudeEntry.actionName, displayName: claudeEntry.displayName },
      ]);

      assert.deepStrictEqual(result.updated, []);
      assert.strictEqual(result.backupPath, null);
      assert.strictEqual(fs.statSync(catalogPath).mtimeMs, beforeMtime);
    });

    it("ignores updates for actionNames not present in the catalog", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [preexisting]);

      const result = performFindReplace(catalogPath, [{ actionName: "does.not.exist", displayName: "X" }]);
      assert.deepStrictEqual(result.updated, []);
      assert.strictEqual(result.backupPath, null);
    });
  });
});
