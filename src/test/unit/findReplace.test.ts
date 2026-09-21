import * as assert from "assert";
import { applyFindReplaceRules, parseLineDelimitedPairs } from "../../findReplace";

describe("findReplace", () => {
  describe("applyFindReplaceRules", () => {
    it("replaces every occurrence of find with replace", () => {
      assert.strictEqual(
        applyFindReplaceRules("Claude Code: Accept Claude Code: Reject", { "Claude Code: ": "" }),
        "Accept Reject"
      );
    });

    it("supports removal via an empty replace string", () => {
      assert.strictEqual(
        applyFindReplaceRules("Turbo Console Log: Insert Log", { "Turbo Console Log: ": "" }),
        "Insert Log"
      );
    });

    it("supports a non-empty replacement", () => {
      assert.strictEqual(applyFindReplaceRules("Old Name", { Old: "New" }), "New Name");
    });

    it("applies multiple rules in order", () => {
      const result = applyFindReplaceRules("Foo Bar Baz", { Foo: "A", Baz: "B" });
      assert.strictEqual(result, "A Bar B");
    });

    it("treats find as a literal string, not a regular expression", () => {
      assert.strictEqual(applyFindReplaceRules("a.b.c", { ".": "-" }), "a-b-c");
      // If "." were treated as a regex wildcard, this would incorrectly also match "X" etc.
      assert.strictEqual(applyFindReplaceRules("aXbXc", { ".": "-" }), "aXbXc");
    });

    it("skips a rule with an empty find string, rather than corrupting the text", () => {
      assert.strictEqual(applyFindReplaceRules("Unchanged", { "": "oops" }), "Unchanged");
    });

    it("returns the text unchanged when find doesn't occur at all", () => {
      assert.strictEqual(applyFindReplaceRules("Nothing to see here", { xyz: "abc" }), "Nothing to see here");
    });

    it("returns the text unchanged when there are no rules", () => {
      assert.strictEqual(applyFindReplaceRules("Unchanged", {}), "Unchanged");
    });
  });

  describe("parseLineDelimitedPairs", () => {
    it("parses a single find|replace line", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs("Claude Code: |"), { "Claude Code: ": "" });
    });

    it("parses multiple lines into multiple rules", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs("Logi Command Manager: |\nTurbo Console Log: |"), {
        "Logi Command Manager: ": "",
        "Turbo Console Log: ": "",
      });
    });

    it("preserves a meaningful trailing space in the find text, taking everything before the delimiter verbatim", () => {
      const rules = parseLineDelimitedPairs("Claude Code: |");
      assert.ok(Object.prototype.hasOwnProperty.call(rules, "Claude Code: "));
    });

    it("captures a non-empty replacement", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs("Old|New"), { Old: "New" });
    });

    it("only splits on the first | on a line, so replace text may itself contain |", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs("Find|Re|place"), { Find: "Re|place" });
    });

    it("skips blank lines without producing a bogus rule", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs("Old|New\n\n   \nFoo|Bar"), { Old: "New", Foo: "Bar" });
    });

    it("skips a line with no | at all, without dropping the other valid lines", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs("Old|New\nthis line is malformed\nFoo|Bar"), {
        Old: "New",
        Foo: "Bar",
      });
    });

    it("skips a line whose find text (before the delimiter) is empty", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs("|onlyReplace\nOld|New"), { Old: "New" });
    });

    it("handles Windows-style CRLF line endings", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs("Old|New\r\nFoo|Bar"), { Old: "New", Foo: "Bar" });
    });

    it("returns an empty object for empty or whitespace-only input", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs(""), {});
      assert.deepStrictEqual(parseLineDelimitedPairs("   \n  \n"), {});
    });

    it("later lines override earlier ones for the same find text, like a plain object would", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs("Old|First\nOld|Second"), { Old: "Second" });
    });
  });
});
