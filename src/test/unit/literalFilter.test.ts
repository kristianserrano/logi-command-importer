import * as assert from "assert";
import { buildSearchText, matchesLiteralQuery } from "../../literalFilter";

describe("literalFilter", () => {
  describe("buildSearchText", () => {
    it("joins non-empty fields with a space and lowercases the result", () => {
      assert.strictEqual(
        buildSearchText(["Logi Command Importer", "logiCommandImporter.importCommands", undefined]),
        "logi command importer logicommandimporter.importcommands"
      );
    });

    it("skips undefined fields without leaving stray separators", () => {
      assert.strictEqual(buildSearchText([undefined, "Git", undefined]), "git");
    });
  });

  describe("matchesLiteralQuery", () => {
    it("matches a literal, case-insensitive substring", () => {
      assert.ok(matchesLiteralQuery("logi command manager", "Logi"));
      assert.ok(matchesLiteralQuery("logi command manager", "COMMAND MANAGER"));
    });

    it("does not match via fuzzy subsequence — this is the whole point", () => {
      // Reproduces the reported bug: searching "Logi " (trailing space) should not match
      // "turboConsoleLog.insertConsoleLog", even though its characters L-o-g-...-i appear in
      // order somewhere in the string (which is what VS Code's built-in fuzzy filter would do).
      const searchText = buildSearchText(["Insert Console Log", "turboConsoleLog.insertConsoleLog"]);
      assert.ok(!matchesLiteralQuery(searchText, "Logi"));
    });

    it("treats an empty or whitespace-only query as matching everything", () => {
      assert.ok(matchesLiteralQuery("anything at all", ""));
      assert.ok(matchesLiteralQuery("anything at all", "   "));
    });

    it("trims leading/trailing whitespace from the query before matching", () => {
      assert.ok(matchesLiteralQuery("logi command manager", "  logi  "));
    });

    it("does not match text that doesn't contain the query at all", () => {
      assert.ok(!matchesLiteralQuery("git commit", "logi"));
    });
  });
});
