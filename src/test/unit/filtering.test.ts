import * as assert from "assert";
import { matchesAnyNamespace, matchesSourceExtension } from "../../filtering";

describe("filtering", () => {
  describe("matchesAnyNamespace", () => {
    it("matches when the command id starts with any given prefix", () => {
      assert.ok(matchesAnyNamespace("git.commit", ["git.", "workbench.action."]));
      assert.ok(matchesAnyNamespace("workbench.action.debug.stop", ["git.", "workbench.action."]));
    });

    it("does not match unrelated commands", () => {
      assert.ok(!matchesAnyNamespace("editor.action.format", ["git.", "workbench.action."]));
    });

    it("returns false when no prefixes are configured", () => {
      assert.ok(!matchesAnyNamespace("git.commit", []));
    });
  });

  describe("matchesSourceExtension", () => {
    it("matches nothing when no extension ids are configured — an empty list is not \"match everything\"", () => {
      assert.ok(!matchesSourceExtension("pub.ext", []));
    });

    it("matches only the configured extension ids", () => {
      assert.ok(matchesSourceExtension("pub.ext", ["pub.ext", "pub.other"]));
      assert.ok(!matchesSourceExtension("pub.unlisted", ["pub.ext"]));
    });
  });
});
