import * as assert from "assert";
import { buildDisplayNameFromManifest, deriveDefaultGroup, deriveDefaultSubGroup, inferDisplayName } from "../../naming";

describe("naming", () => {
  describe("inferDisplayName", () => {
    it("converts camelCase segments into title case", () => {
      assert.strictEqual(inferDisplayName("turboConsoleLog.displayLogMessage"), "Display Log Message");
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

  describe("deriveDefaultGroup", () => {
    it("uses the source extension display name", () => {
      assert.strictEqual(deriveDefaultGroup("Turbo Console Log"), "Turbo Console Log");
    });

    it("falls back to Other for a blank display name", () => {
      assert.strictEqual(deriveDefaultGroup("   "), "Other");
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
        deriveDefaultSubGroup("turboConsoleLog.manageLogs.deleteAll", {}, ["turboConsoleLog."]),
        "Manage Logs"
      );
    });

    it("strips the matched namespace prefix before deriving a subgroup, instead of repeating the namespace root", () => {
      assert.strictEqual(
        deriveDefaultSubGroup("claude-vscode.editor.open", {}, ["claude-vscode."]),
        "Editor"
      );
    });

    it("returns null (no subgroup) for a top-level command once its namespace prefix is stripped", () => {
      assert.strictEqual(deriveDefaultSubGroup("claude-vscode.acceptChange", {}, ["claude-vscode."]), null);
    });

    it("returns null (no default subgroup) when no configured namespace prefix matches the command at all, rather than deriving one from its full, un-stripped namespace", () => {
      // This is what fragmented a single extension into a dozen-plus near-meaningless
      // subgroups when commands were included via extension search rather than a namespace
      // prefix (e.g. "claude-vscode.editor.open", "claudeVSCodeSidebar.focus", and
      // "workbench.view.extension.claude-sidebar" all belong to the same extension but share no
      // namespace prefix at all, so deriving a subgroup from each one's own full namespace
      // produced a different, incoherent subgroup per command-id shape).
      assert.strictEqual(deriveDefaultSubGroup("claude-vscode.editor.open", {}, []), null);
      assert.strictEqual(deriveDefaultSubGroup("claude-vscode.editor.open", {}, ["git."]), null);
      assert.strictEqual(deriveDefaultSubGroup("claudeVSCodeSidebar.focus", {}, []), null);
      assert.strictEqual(
        deriveDefaultSubGroup("workbench.view.extension.claude-sidebar", {}, []),
        null
      );
    });

    it("still prefers an explicit subGroupRule over namespace-prefix stripping", () => {
      const rules = { "claude-vscode.editor.": "Editor Commands" };
      assert.strictEqual(
        deriveDefaultSubGroup("claude-vscode.editor.open", rules, ["claude-vscode."]),
        "Editor Commands"
      );
    });
  });

  describe("buildDisplayNameFromManifest", () => {
    it("uses a declared title verbatim, including whatever prefix (or lack thereof) the extension author chose to type into it", () => {
      assert.strictEqual(
        buildDisplayNameFromManifest("claude-vscode.acceptProposedHunkFromBar", "Accept this change"),
        "Accept this change"
      );
      assert.strictEqual(
        buildDisplayNameFromManifest("claude-vscode.acceptProposedDiff", "Claude Code: Accept Proposed Changes"),
        "Claude Code: Accept Proposed Changes"
      );
    });

    it("infers a display name from the command id when no title is declared", () => {
      assert.strictEqual(buildDisplayNameFromManifest("claude-vscode.acceptChange", undefined), "Accept Change");
    });
  });
});
