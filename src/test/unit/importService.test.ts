import * as assert from "assert";
import * as fs from "fs";
import { performFindReplace, performImport, performRemoval } from "../../importService";
import { readCatalog, writeCatalog } from "../../catalogIO";
import { CandidateEntry, CatalogEntry } from "../../types";
import { tempCatalogPath } from "./testUtils";

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

    it("removes nothing when the requested action names don't exist in the catalog", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [preexisting]);

      const result = performRemoval(catalogPath, ["does.not.exist"]);
      assert.deepStrictEqual(result.removed, []);
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
    const myExtEntry: CatalogEntry = {
      selected: true,
      actionName: "my-ext.acceptProposedHunkFromBar",
      groupName: "My Extension for VS Code",
      displayName: "My Extension: Accept this change",
      subGroupName: null,
    };

    it("applies pre-computed displayName/groupName updates only to explicitly selected entries, with a backup", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [preexisting, myExtEntry]);

      const result = performFindReplace(catalogPath, [
        { actionName: myExtEntry.actionName, displayName: "Accept this change" },
      ]);

      assert.deepStrictEqual(result.updated, [myExtEntry.actionName]);
      assert.ok(result.backupPath && fs.existsSync(result.backupPath));

      const catalog = readCatalog(catalogPath);
      const updated = catalog.find((e) => e.actionName === myExtEntry.actionName);
      assert.strictEqual(updated?.displayName, "Accept this change");
      const untouched = catalog.find((e) => e.actionName === preexisting.actionName);
      assert.strictEqual(untouched?.displayName, preexisting.displayName);
    });

    it("updates groupName independently of displayName", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [myExtEntry]);

      performFindReplace(catalogPath, [{ actionName: myExtEntry.actionName, groupName: "My Extension" }]);

      const catalog = readCatalog(catalogPath);
      assert.strictEqual(catalog[0].groupName, "My Extension");
      assert.strictEqual(catalog[0].displayName, myExtEntry.displayName);
    });

    it("does not count or write an update that produces no actual change", () => {
      const catalogPath = tempCatalogPath();
      writeCatalog(catalogPath, [myExtEntry]);
      const beforeMtime = fs.statSync(catalogPath).mtimeMs;

      const result = performFindReplace(catalogPath, [
        { actionName: myExtEntry.actionName, displayName: myExtEntry.displayName },
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
