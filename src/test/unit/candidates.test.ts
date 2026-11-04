import * as assert from "assert";
import { buildCandidates, excludeAlreadyCataloged } from "../../candidates";
import { SAVED_COMMANDS_GROUP } from "../../naming";
import { CandidateEntry, CommandKind, DEFAULT_CONFIG, DiscoveredCommand, ImporterConfig } from "../../types";

function cmd(commandId: string, kind: CommandKind, extra: Partial<DiscoveredCommand> = {}): DiscoveredCommand {
  return { commandId, kind, sourceExtensionId: "pub.myext", sourceExtensionDisplayName: "My Extension", ...extra };
}

function config(overrides: Partial<ImporterConfig>): ImporterConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

const ids = (list: CandidateEntry[]) => list.map((c) => c.commandId);

describe("candidates", () => {
  describe("duplicate titles", () => {
    const dup = (id: string, extra: Partial<DiscoveredCommand> = {}) => cmd(id, "declared", { title: "Hide Pull Requests", ...extra });
    const names = (list: CandidateEntry[]) => Object.fromEntries(list.map((c) => [c.commandId, c.displayName]));

    it("suffixes colliding titles with the part of the id that differs", () => {
      const result = buildCandidates([dup("x.views.branches.hide"), dup("x.views.remotes.hide"), dup("x.views.tags.hide")], config({}));
      assert.deepStrictEqual(names(result), {
        "x.views.branches.hide": "Hide Pull Requests (branches)",
        "x.views.remotes.hide": "Hide Pull Requests (remotes)",
        "x.views.tags.hide": "Hide Pull Requests (tags)",
      });
    });

    it("always keeps at least one id segment, even when one id is a prefix of the other", () => {
      const result = buildCandidates([dup("x.approve"), dup("x.approve.more")], config({}));
      assert.deepStrictEqual(names(result), {
        "x.approve": "Hide Pull Requests (approve)",
        "x.approve.more": "Hide Pull Requests (approve more)",
      });
    });

    it("shows the qualifier as lowercase words with camelCase split", () => {
      const result = buildCandidates([dup("x.openOnDotDev"), dup("x.openOnGitHub")], config({}));
      assert.deepStrictEqual(names(result), {
        "x.openOnDotDev": "Hide Pull Requests (open on dot dev)",
        "x.openOnGitHub": "Hide Pull Requests (open on git hub)",
      });
    });

    it("leaves unique titles, and titles in different categories, alone", () => {
      const result = buildCandidates(
        [dup("a.one"), dup("b.one", { category: "Other" }), cmd("a.two", "declared", { title: "Different" })],
        config({})
      );
      assert.deepStrictEqual(names(result), { "a.one": "Hide Pull Requests", "b.one": "Hide Pull Requests", "a.two": "Different" });
    });

    it("never alters an explicit displayNameOverrides entry", () => {
      const result = buildCandidates(
        [dup("x.a.hide"), dup("x.b.hide")],
        config({ displayNameOverrides: { "x.a.hide": "Hide Pull Requests" } })
      );
      assert.deepStrictEqual(names(result), { "x.a.hide": "Hide Pull Requests", "x.b.hide": "Hide Pull Requests (b)" });
    });
  });

  describe("inclusion", () => {
    const discovered: DiscoveredCommand[] = [
      cmd("myExtension.declared", "declared", { title: "Declared" }),
      cmd("myView.focus", "generated", { title: "Focus on My View", defaultSubGroupName: "Views" }),
      cmd("other.declared", "declared", { sourceExtensionId: "pub.other", sourceExtensionDisplayName: "Other" }),
      cmd("workbench.action.thing", "undeclared", { sourceExtensionId: "unknown", sourceExtensionDisplayName: "Undeclared" }),
      cmd("myExtension.runtimeOnly", "undeclared", { sourceExtensionId: "unknown", sourceExtensionDisplayName: "Undeclared" }),
    ];

    it("with no criteria includes declared and generated only, never undeclared", () => {
      assert.deepStrictEqual(ids(buildCandidates(discovered, config({}))), ["myExtension.declared", "myView.focus", "other.declared"]);
    });

    it("a namespace prefix includes matching commands of any kind", () => {
      const result = buildCandidates(discovered, config({ namespacePrefixes: ["myExtension."] }));
      assert.deepStrictEqual(ids(result), ["myExtension.declared", "myExtension.runtimeOnly"]);
    });

    it("a picked extension includes its declared and generated commands but no undeclared ones", () => {
      const result = buildCandidates(discovered, config({ sourceExtensionFilters: ["pub.myext"] }));
      assert.deepStrictEqual(ids(result), ["myExtension.declared", "myView.focus"]);
    });

    it("a picked 'unknown' extension id never pulls in undeclared commands", () => {
      assert.deepStrictEqual(ids(buildCandidates(discovered, config({ sourceExtensionFilters: ["unknown"] }))), []);
    });

    it("prefixes and picked extensions are independent (OR)", () => {
      const result = buildCandidates(
        discovered,
        config({ namespacePrefixes: ["workbench.action."], sourceExtensionFilters: ["pub.other"] })
      );
      assert.deepStrictEqual(ids(result), ["other.declared", "workbench.action.thing"]);
    });

    it("sorts results by command id", () => {
      const result = buildCandidates([cmd("b.cmd", "declared"), cmd("a.cmd", "declared")], config({}));
      assert.deepStrictEqual(ids(result), ["a.cmd", "b.cmd"]);
    });
  });

  describe("declared commands", () => {
    it("groups under the manifest category as written, and uses the title verbatim", () => {
      const [entry] = buildCandidates(
        [cmd("myExtension.go", "declared", { title: "My Ext: Go", category: "Navigation" })],
        config({})
      );
      assert.strictEqual(entry.groupName, "Navigation");
      assert.strictEqual(entry.displayName, "My Ext: Go");
    });

    it("falls back to the extension display name when there is no category", () => {
      const [entry] = buildCandidates([cmd("myExtension.go", "declared", { title: "Go" })], config({}));
      assert.strictEqual(entry.groupName, "My Extension");
    });

    it("infers the display name from the id when there is no title", () => {
      const [entry] = buildCandidates([cmd("myExtension.acceptChange", "declared")], config({}));
      assert.strictEqual(entry.displayName, "Accept Change");
    });

    it("never derives a subcategory from the command id namespace, even with a matching prefix", () => {
      const [entry] = buildCandidates(
        [cmd("myExtension.editor.open", "declared", { title: "Open" })],
        config({ namespacePrefixes: ["myExtension."] })
      );
      assert.strictEqual(entry.subGroupName, null);
    });

    it("honors a subGroupRules override, longest prefix winning", () => {
      const result = buildCandidates(
        [cmd("myExtension.editor.open", "declared"), cmd("myExtension.editor.sub.open", "declared"), cmd("myExtension.plain", "declared")],
        config({ subGroupRules: { "myExtension.editor.": "Editor", "myExtension.editor.sub.": "Deep" } })
      );
      const byId = new Map(result.map((c) => [c.commandId, c.subGroupName]));
      assert.strictEqual(byId.get("myExtension.editor.open"), "Editor");
      assert.strictEqual(byId.get("myExtension.editor.sub.open"), "Deep");
      assert.strictEqual(byId.get("myExtension.plain"), null);
    });
  });

  describe("generated commands", () => {
    it("groups under the extension name with the discovery-chosen subcategory", () => {
      const [entry] = buildCandidates(
        [cmd("mySidebar.focus", "generated", { title: "Focus on My Sidebar View", defaultSubGroupName: "Activity Bar" })],
        config({})
      );
      assert.strictEqual(entry.groupName, "My Extension");
      assert.strictEqual(entry.subGroupName, "Activity Bar");
      assert.strictEqual(entry.displayName, "Focus on My Sidebar View");
    });

    it("lets a subGroupRules match override the default subcategory", () => {
      const [entry] = buildCandidates(
        [cmd("mySidebar.focus", "generated", { title: "Focus", defaultSubGroupName: "Views" })],
        config({ subGroupRules: { "mySidebar.": "Sidebar" } })
      );
      assert.strictEqual(entry.subGroupName, "Sidebar");
    });
  });

  describe("undeclared commands", () => {
    const undeclared = (id: string) =>
      cmd(id, "undeclared", { sourceExtensionId: "unknown", sourceExtensionDisplayName: "Undeclared" });

    it("groups under Saved Commands with a prefix-derived subcategory and palette-style display name", () => {
      const [entry] = buildCandidates(
        [undeclared("workbench.action.debug.stop")],
        config({ namespacePrefixes: ["workbench.action."] })
      );
      assert.strictEqual(entry.groupName, SAVED_COMMANDS_GROUP);
      assert.strictEqual(entry.subGroupName, "Debug");
      assert.strictEqual(entry.displayName, "Debug: Stop");
      assert.strictEqual(entry.sourceExtensionId, "unknown");
      assert.strictEqual(entry.sourceExtensionDisplayName, "Undeclared");
    });

    it("a flat id after the prefix has no subcategory and just the inferred name", () => {
      const [entry] = buildCandidates([undeclared("git.commitAll")], config({ namespacePrefixes: ["git."] }));
      assert.strictEqual(entry.subGroupName, null);
      assert.strictEqual(entry.displayName, "Commit All");
    });

    it("honors subGroupRules over the prefix-derived subcategory", () => {
      const [entry] = buildCandidates(
        [undeclared("workbench.action.debug.stop")],
        config({ namespacePrefixes: ["workbench.action."], subGroupRules: { "workbench.action.debug.": "Debugging" } })
      );
      assert.strictEqual(entry.subGroupName, "Debugging");
      assert.strictEqual(entry.displayName, "Debugging: Stop");
    });
  });

  describe("overrides and find/replace", () => {
    it("overrides win over derived display and group names, for every kind", () => {
      const result = buildCandidates(
        [cmd("a.declared", "declared"), cmd("a.view.focus", "generated"), cmd("a.undeclared", "undeclared")],
        config({
          namespacePrefixes: ["a."],
          displayNameOverrides: { "a.declared": "D", "a.view.focus": "G", "a.undeclared": "U" },
          groupNameOverrides: { "a.declared": "GD", "a.view.focus": "GG", "a.undeclared": "GU" },
        })
      );
      assert.deepStrictEqual(result.map((c) => [c.displayName, c.groupName]), [["D", "GD"], ["U", "GU"], ["G", "GG"]]);
    });

    it("applies displayNameFindReplace to derived names of every kind, and groupNameFindReplace to declared/generated groups", () => {
      const result = buildCandidates(
        [
          cmd("a.declared", "declared", { title: "My Ext: Accept", category: "My Ext for VS Code" }),
          cmd("a.view.focus", "generated", { title: "Focus on X View" }),
          cmd("a.undeclared", "undeclared"),
        ],
        config({
          namespacePrefixes: ["a."],
          displayNameFindReplace: { "My Ext: ": "", Undeclared: "", "Un Declared": "Replaced" },
          groupNameFindReplace: { " for VS Code": "", "Saved ": "", "My Extension": "Renamed" },
        })
      );
      const byId = new Map(result.map((c) => [c.commandId, c]));
      assert.strictEqual(byId.get("a.declared")?.displayName, "Accept");
      assert.strictEqual(byId.get("a.declared")?.groupName, "My Ext");
      assert.strictEqual(byId.get("a.view.focus")?.groupName, "Renamed");
      assert.strictEqual(byId.get("a.undeclared")?.groupName, SAVED_COMMANDS_GROUP);
    });

    it("never applies find/replace rules to an explicit override", () => {
      const [entry] = buildCandidates(
        [cmd("a.declared", "declared", { title: "My Ext: Accept" })],
        config({ displayNameOverrides: { "a.declared": "My Ext: Keep" }, displayNameFindReplace: { "My Ext: ": "" } })
      );
      assert.strictEqual(entry.displayName, "My Ext: Keep");
    });
  });
});

describe("excludeAlreadyCataloged", () => {
  const candidateA: CandidateEntry = {
    commandId: "git.commit",
    sourceExtensionId: "vscode.git",
    sourceExtensionDisplayName: "Git",
    displayName: "Commit",
    groupName: "Git",
    subGroupName: null,
  };
  const candidateB: CandidateEntry = {
    commandId: "git.push",
    sourceExtensionId: "vscode.git",
    sourceExtensionDisplayName: "Git",
    displayName: "Push",
    groupName: "Git",
    subGroupName: null,
  };

  it("removes candidates whose commandId already exists as a catalog actionName", () => {
    const result = excludeAlreadyCataloged([candidateA, candidateB], ["git.commit"]);
    assert.deepStrictEqual(
      result.map((c) => c.commandId),
      ["git.push"]
    );
  });

  it("keeps every candidate when nothing in the catalog matches", () => {
    const result = excludeAlreadyCataloged([candidateA, candidateB], ["some.other.action"]);
    assert.deepStrictEqual(
      result.map((c) => c.commandId),
      ["git.commit", "git.push"]
    );
  });

  it("returns an empty array when every candidate is already cataloged", () => {
    const result = excludeAlreadyCataloged([candidateA, candidateB], ["git.commit", "git.push"]);
    assert.deepStrictEqual(result, []);
  });
});
