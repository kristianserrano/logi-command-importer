import * as assert from "assert";
import {
  applyFindReplaceRules,
  computeFindReplaceChanges,
  formatChangePreview,
  parseLineDelimitedPairs,
} from "../../findReplace";

describe("findReplace", () => {
  describe("applyFindReplaceRules", () => {
    it("replaces every occurrence of find with replace", () => {
      assert.strictEqual(
        applyFindReplaceRules("My Extension: Accept My Extension: Reject", { "My Extension: ": "" }),
        "Accept Reject"
      );
    });

    it("supports removal via an empty replace string", () => {
      assert.strictEqual(
        applyFindReplaceRules("Other Extension: Insert Log", { "Other Extension: ": "" }),
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
      assert.deepStrictEqual(parseLineDelimitedPairs("My Extension: |"), { "My Extension: ": "" });
    });

    it("parses multiple lines into multiple rules", () => {
      assert.deepStrictEqual(parseLineDelimitedPairs("Logi Command Manager: |\nOther Extension: |"), {
        "Logi Command Manager: ": "",
        "Other Extension: ": "",
      });
    });

    it("preserves a meaningful trailing space in the find text, taking everything before the delimiter verbatim", () => {
      const rules = parseLineDelimitedPairs("My Extension: |");
      assert.ok(Object.prototype.hasOwnProperty.call(rules, "My Extension: "));
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

  describe("computeFindReplaceChanges", () => {
    const catalog = [
      { actionName: "a.one", displayName: "My Extension: One", groupName: "My Extension" },
      { actionName: "a.two", displayName: "Two", groupName: "My Extension" },
      { actionName: "a.three", displayName: "My Extension: Three", groupName: "Other" },
      { actionName: "a.four", displayName: "Four", groupName: "Other" },
    ];
    const rule = { "My Extension": "CC" };

    it("scope displayName only changes display names", () => {
      assert.deepStrictEqual(computeFindReplaceChanges(catalog, rule, "displayName"), [
        { actionName: "a.one", newDisplayName: "CC: One", newGroupName: undefined },
        { actionName: "a.three", newDisplayName: "CC: Three", newGroupName: undefined },
      ]);
    });

    it("scope groupName only changes group names (group-only change)", () => {
      assert.deepStrictEqual(computeFindReplaceChanges(catalog, rule, "groupName"), [
        { actionName: "a.one", newDisplayName: undefined, newGroupName: "CC" },
        { actionName: "a.two", newDisplayName: undefined, newGroupName: "CC" },
      ]);
    });

    it("scope both changes either or both fields, skipping no-op entries", () => {
      const changes = computeFindReplaceChanges(catalog, rule, "both");
      assert.deepStrictEqual(changes, [
        { actionName: "a.one", newDisplayName: "CC: One", newGroupName: "CC" },
        { actionName: "a.two", newDisplayName: undefined, newGroupName: "CC" },
        { actionName: "a.three", newDisplayName: "CC: Three", newGroupName: undefined },
      ]);
      assert.ok(!changes.some((c) => c.actionName === "a.four"));
    });

    it("returns nothing when no entry matches", () => {
      assert.deepStrictEqual(computeFindReplaceChanges(catalog, { zzz: "y" }, "both"), []);
      assert.deepStrictEqual(computeFindReplaceChanges([], rule, "both"), []);
    });

    it("replaces multiple matches within one field", () => {
      const result = computeFindReplaceChanges(
        [{ actionName: "x", displayName: "ab ab ab", groupName: "g" }],
        { ab: "c" },
        "displayName"
      );
      assert.deepStrictEqual(result, [{ actionName: "x", newDisplayName: "c c c", newGroupName: undefined }]);
    });

    it("treats find as literal text even when it contains regex characters", () => {
      const entries = [
        { actionName: "x", displayName: "Run (all) [tests]. Now", groupName: "g.*" },
        { actionName: "y", displayName: "Run Xall tests", groupName: "gabc" },
      ];
      assert.deepStrictEqual(computeFindReplaceChanges(entries, { "(all) [tests].": "T" }, "displayName"), [
        { actionName: "x", newDisplayName: "Run T Now", newGroupName: undefined },
      ]);
      assert.deepStrictEqual(computeFindReplaceChanges(entries, { ".*": "!" }, "groupName"), [
        { actionName: "x", newDisplayName: undefined, newGroupName: "g!" },
      ]);
    });

    it("never touches actionName", () => {
      const changes = computeFindReplaceChanges(
        [{ actionName: "My Extension.cmd", displayName: "My Extension", groupName: "g" }],
        rule,
        "both"
      );
      assert.strictEqual(changes[0].actionName, "My Extension.cmd");
    });
  });

  describe("formatChangePreview", () => {
    const entry = { actionName: "a", displayName: "Old", groupName: "OldG" };

    it("shows display-name change only", () => {
      assert.strictEqual(formatChangePreview(entry, { actionName: "a", newDisplayName: "New" }), '"Old" → "New"');
    });

    it("shows group change only", () => {
      assert.strictEqual(formatChangePreview(entry, { actionName: "a", newGroupName: "NewG" }), 'group: "OldG" → "NewG"');
    });

    it("shows both, separated by three spaces", () => {
      assert.strictEqual(
        formatChangePreview(entry, { actionName: "a", newDisplayName: "New", newGroupName: "NewG" }),
        '"Old" → "New"   group: "OldG" → "NewG"'
      );
    });
  });
});
