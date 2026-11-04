import * as assert from "assert";
import { buildDisplayNameFromManifest, deriveDefaultSubGroup, inferDisplayName, SAVED_COMMANDS_GROUP } from "../../naming";

describe("naming", () => {
  describe("inferDisplayName", () => {
    it("converts camelCase segments into title case", () => {
      assert.strictEqual(inferDisplayName("myExtension.displayLogMessage"), "Display Log Message");
    });

    it("converts dot-separated namespaces, using only the final segment", () => {
      assert.strictEqual(inferDisplayName("workbench.action.debug.stop"), "Stop");
    });

    it("converts punctuation/underscore/hyphen separated words", () => {
      assert.strictEqual(inferDisplayName("myExtension.do_the-thing"), "Do The Thing");
    });

    it("preserves acronyms instead of lower-casing them", () => {
      assert.strictEqual(inferDisplayName("myExtension.openURLInBrowser"), "Open URL In Browser");
    });

    it("falls back to the raw command id when nothing can be split", () => {
      assert.strictEqual(inferDisplayName(""), "");
    });
  });

  describe("deriveDefaultSubGroup", () => {
    it("uses the longest matching configured rule prefix", () => {
      const rules = {
        "git.": "Git",
        "git.branch.": "Git Branches",
      };
      assert.strictEqual(deriveDefaultSubGroup("git.branch.create", rules), "Git Branches");
      assert.strictEqual(deriveDefaultSubGroup("git.commit", rules), "Git");
    });

    it("falls back to the command's own namespace, after stripping the namespace prefix that matched it, when no rule matches", () => {
      assert.strictEqual(
        deriveDefaultSubGroup("workbench.action.debug.stop", {}, ["workbench.action."]),
        "Debug"
      );
    });

    it("returns null for a top-level command id with no namespace left after stripping the matched prefix", () => {
      assert.strictEqual(deriveDefaultSubGroup("git.commit", {}, ["git."]), null);
    });

    it("splits hyphenated/camelCase namespace segments into readable words instead of title-casing them raw", () => {
      assert.strictEqual(
        deriveDefaultSubGroup("myExtension.manageLogs.deleteAll", {}, ["myExtension."]),
        "Manage Logs"
      );
    });

    it("strips the matched namespace prefix before deriving a subgroup, instead of repeating the namespace root", () => {
      assert.strictEqual(
        deriveDefaultSubGroup("my-ext.editor.open", {}, ["my-ext."]),
        "Editor"
      );
    });

    it("returns null (no subgroup) for a top-level command once its namespace prefix is stripped", () => {
      assert.strictEqual(deriveDefaultSubGroup("my-ext.acceptChange", {}, ["my-ext."]), null);
    });

    it("returns null (no default subgroup) when no configured namespace prefix matches the command at all, rather than deriving one from its full, un-stripped namespace", () => {
      // This is what fragmented a single extension into a dozen-plus near-meaningless
      // subgroups when commands were included via extension search rather than a namespace
      // prefix (e.g. "my-ext.editor.open", "myExtSidebar.focus", and
      // "workbench.view.extension.my-sidebar" all belong to the same extension but share no
      // namespace prefix at all, so deriving a subgroup from each one's own full namespace
      // produced a different, incoherent subgroup per command-id shape).
      assert.strictEqual(deriveDefaultSubGroup("my-ext.editor.open", {}, []), null);
      assert.strictEqual(deriveDefaultSubGroup("my-ext.editor.open", {}, ["git."]), null);
      assert.strictEqual(deriveDefaultSubGroup("myExtSidebar.focus", {}, []), null);
      assert.strictEqual(
        deriveDefaultSubGroup("workbench.view.extension.my-sidebar", {}, []),
        null
      );
    });

    it("still prefers an explicit subGroupRule over namespace-prefix stripping", () => {
      const rules = { "my-ext.editor.": "Editor Commands" };
      assert.strictEqual(
        deriveDefaultSubGroup("my-ext.editor.open", rules, ["my-ext."]),
        "Editor Commands"
      );
    });
  });

  describe("SAVED_COMMANDS_GROUP", () => {
    it("is Logitech's default category name", () => {
      assert.strictEqual(SAVED_COMMANDS_GROUP, "Saved Commands");
    });
  });

  describe("buildDisplayNameFromManifest", () => {
    it("uses a declared title verbatim, including whatever prefix (or lack thereof) the extension author chose to type into it", () => {
      assert.strictEqual(
        buildDisplayNameFromManifest("my-ext.acceptProposedHunkFromBar", "Accept this change"),
        "Accept this change"
      );
      assert.strictEqual(
        buildDisplayNameFromManifest("my-ext.acceptProposedDiff", "My Ext: Accept Proposed Changes"),
        "My Ext: Accept Proposed Changes"
      );
    });

    it("infers a display name from the command id when no title is declared", () => {
      assert.strictEqual(buildDisplayNameFromManifest("my-ext.acceptChange", undefined), "Accept Change");
    });
  });
});
