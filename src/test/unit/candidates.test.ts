import * as assert from "assert";
import { buildCandidates, excludeAlreadyCataloged } from "../../candidates";
import { CandidateEntry, DEFAULT_CONFIG, DiscoveredCommand, ImporterConfig } from "../../types";

const discovered: DiscoveredCommand[] = [
  { commandId: "turboConsoleLog.displayLogMessage", sourceExtensionId: "pub.turbo", sourceExtensionDisplayName: "Turbo Console Log" },
  { commandId: "turboConsoleLog.view.focus", sourceExtensionId: "pub.turbo", sourceExtensionDisplayName: "Turbo Console Log" },
  { commandId: "git.commit", sourceExtensionId: "vscode.git", sourceExtensionDisplayName: "Git" },
];

function config(overrides: Partial<ImporterConfig>): ImporterConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

describe("candidates", () => {
  it("returns every discovered command when neither namespace prefixes nor source extension filters are configured", () => {
    // With no criterion to filter by, showing nothing would just be a dead end — the same way
    // VS Code's own Command Palette shows every command and relies on its search box to narrow
    // down, rather than requiring a filter to be picked first.
    const result = buildCandidates(discovered, config({}));
    assert.deepStrictEqual(
      result.map((c) => c.commandId).sort(),
      ["git.commit", "turboConsoleLog.displayLogMessage", "turboConsoleLog.view.focus"]
    );
  });

  it("filters to only commands matching the configured namespace prefixes", () => {
    const result = buildCandidates(discovered, config({ namespacePrefixes: ["turboConsoleLog."] }));
    assert.deepStrictEqual(
      result.map((c) => c.commandId),
      ["turboConsoleLog.displayLogMessage", "turboConsoleLog.view.focus"]
    );
  });

  it("does not filter out a command merely because its id ends in a generated-looking suffix like .focus — only an exact isGenerated match does that", () => {
    const cfg = config({ namespacePrefixes: ["turboConsoleLog."] });
    const result = buildCandidates(discovered, cfg);
    assert.ok(result.some((c) => c.commandId === "turboConsoleLog.view.focus"));
  });

  it("always excludes a command flagged isGenerated, even when it matches a configured namespace prefix or source extension", () => {
    const withGenerated: DiscoveredCommand[] = [
      ...discovered,
      {
        commandId: "turboConsoleLog.sidebar.focus",
        sourceExtensionId: "pub.turbo",
        sourceExtensionDisplayName: "Turbo Console Log",
        isGenerated: true,
      },
    ];
    const cfg = config({ namespacePrefixes: ["turboConsoleLog."], sourceExtensionFilters: ["pub.turbo"] });
    const result = buildCandidates(withGenerated, cfg);
    assert.ok(!result.some((c) => c.commandId === "turboConsoleLog.sidebar.focus"));
  });

  it("applies display-name and group-name overrides from configuration", () => {
    const cfg = config({
      namespacePrefixes: ["git."],
      displayNameOverrides: { "git.commit": "Commit Changes" },
      groupNameOverrides: { "git.commit": "Source Control" },
    });
    const [entry] = buildCandidates(discovered, cfg);
    assert.strictEqual(entry.displayName, "Commit Changes");
    assert.strictEqual(entry.groupName, "Source Control");
  });

  it("applies displayNameFindReplace/groupNameFindReplace rules to inferred names", () => {
    const claudeCommands: DiscoveredCommand[] = [
      {
        commandId: "claude-vscode.acceptProposedHunkFromBar",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
        title: "Claude Code: Accept this change",
      },
    ];
    const cfg = config({
      namespacePrefixes: ["claude-vscode."],
      displayNameFindReplace: { "Claude Code: ": "" },
      groupNameFindReplace: { "for VS Code": "" },
    });
    const [entry] = buildCandidates(claudeCommands, cfg);
    assert.strictEqual(entry.displayName, "Accept this change");
    assert.strictEqual(entry.groupName, "Claude Code ");
  });

  it("never applies find/replace rules to an explicit displayNameOverrides/groupNameOverrides entry", () => {
    const claudeCommands: DiscoveredCommand[] = [
      {
        commandId: "claude-vscode.acceptProposedHunkFromBar",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
        title: "Claude Code: Accept this change",
      },
    ];
    const cfg = config({
      namespacePrefixes: ["claude-vscode."],
      displayNameOverrides: { "claude-vscode.acceptProposedHunkFromBar": "Claude Code: Accept" },
      displayNameFindReplace: { "Claude Code: ": "" },
    });
    const [entry] = buildCandidates(claudeCommands, cfg);
    assert.strictEqual(entry.displayName, "Claude Code: Accept");
  });

  it("falls back to inferred display name and default group when no override is configured", () => {
    const cfg = config({ namespacePrefixes: ["git."] });
    const [entry] = buildCandidates(discovered, cfg);
    assert.strictEqual(entry.displayName, "Commit");
    assert.strictEqual(entry.groupName, "Git");
  });

  it("includes every command from a configured source extension, even with no namespace prefix given", () => {
    // "Search by extension" needs to work standalone — e.g. to catch VS Code's auto-generated
    // per-view commands, which share no namespace with an extension's own declared commands.
    const cfg = config({ namespacePrefixes: [], sourceExtensionFilters: ["vscode.git"] });
    const result = buildCandidates(discovered, cfg);
    assert.deepStrictEqual(
      result.map((c) => c.commandId),
      ["git.commit"]
    );
  });

  it("treats namespace prefixes and source extension filters as independent inclusion criteria (OR), not a narrowing AND", () => {
    const cfg = config({ namespacePrefixes: ["turboConsoleLog."], sourceExtensionFilters: ["vscode.git"] });
    const result = buildCandidates(discovered, cfg);
    assert.deepStrictEqual(
      result.map((c) => c.commandId).sort(),
      ["git.commit", "turboConsoleLog.displayLogMessage", "turboConsoleLog.view.focus"]
    );
  });

  it("matches nothing from an extension not in sourceExtensionFilters and not matching a namespace prefix", () => {
    const cfg = config({ namespacePrefixes: ["git."], sourceExtensionFilters: ["some.other.extension"] });
    const result = buildCandidates(discovered, cfg);
    assert.deepStrictEqual(
      result.map((c) => c.commandId),
      ["git.commit"]
    );
  });

  it("sorts results by command id", () => {
    const cfg = config({ namespacePrefixes: ["git.", "turboConsoleLog."] });
    const result = buildCandidates(discovered, cfg);
    assert.deepStrictEqual(
      result.map((c) => c.commandId),
      ["git.commit", "turboConsoleLog.displayLogMessage", "turboConsoleLog.view.focus"]
    );
  });

  it("uses each command's declared title verbatim, even when different commands from the same extension are inconsistently titled", () => {
    // Reproduces claude-vscode's real manifest: the extension author hand-typed "Claude Code: "
    // into most titles but not all. That inconsistency is the developer's own choice, not
    // something this extension should second-guess or rewrite.
    const claudeCommands: DiscoveredCommand[] = [
      {
        commandId: "claude-vscode.acceptProposedHunkFromBar",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
        title: "Accept this change",
      },
      {
        commandId: "claude-vscode.acceptProposedHunk",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
        title: "Claude Code: Accept Change at Cursor",
      },
    ];
    const cfg = config({ namespacePrefixes: ["claude-vscode."] });
    const result = buildCandidates(claudeCommands, cfg);

    assert.deepStrictEqual(
      result.map((c) => c.displayName),
      ["Claude Code: Accept Change at Cursor", "Accept this change"]
    );
    assert.ok(result.every((c) => c.groupName === "Claude Code for VS Code"));
  });

  it("does not fragment a single extension into redundant near-duplicate subgroups by namespace depth", () => {
    const claudeCommands: DiscoveredCommand[] = [
      {
        commandId: "claude-vscode.acceptChange",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
      },
      {
        commandId: "claude-vscode.editor.open",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
      },
    ];
    const cfg = config({ namespacePrefixes: ["claude-vscode."] });
    const result = buildCandidates(claudeCommands, cfg);

    assert.deepStrictEqual(
      result.map((c) => c.subGroupName),
      [null, "Editor"]
    );
  });

  it("derives subgroups for extension-based search too, by inferring each extension's own predominant namespace root", () => {
    // Reproduces claude-vscode's real manifest: mostly "claude-vscode.*" commands (with real
    // titles), plus a couple of "claude-code.*" outliers. Searching by extension alone (no
    // namespace prefix typed) should still subgroup the predominant-root commands sensibly,
    // leaving only the minority-root stragglers without a default subgroup.
    const claudeCommands: DiscoveredCommand[] = [
      {
        commandId: "claude-vscode.logout",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
        title: "Logout",
      },
      {
        commandId: "claude-vscode.terminal.open",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
        title: "Open in Terminal",
      },
      {
        commandId: "claude-code.acceptProposedDiff",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
        title: "Accept Proposed Diff",
      },
    ];
    const cfg = config({ sourceExtensionFilters: ["anthropic.claude-vscode"] });
    const result = buildCandidates(claudeCommands, cfg);

    const bySubGroup = new Map(result.map((c) => [c.commandId, c.subGroupName]));
    assert.strictEqual(bySubGroup.get("claude-vscode.logout"), null);
    assert.strictEqual(bySubGroup.get("claude-vscode.terminal.open"), "Terminal");
    assert.strictEqual(bySubGroup.get("claude-code.acceptProposedDiff"), null);
  });

  it("prefers a matched namespace prefix over the inferred predominant root when both are available", () => {
    const claudeCommands: DiscoveredCommand[] = [
      {
        commandId: "claude-vscode.terminal.open",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
        title: "Open in Terminal",
      },
      {
        commandId: "claude-vscode.editor.open",
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
        title: "Open in Editor",
      },
    ];
    const rules = { "claude-vscode.terminal.": "Terminal Commands" };
    const cfg = config({ sourceExtensionFilters: ["anthropic.claude-vscode"], subGroupRules: rules });
    const result = buildCandidates(claudeCommands, cfg);

    const bySubGroup = new Map(result.map((c) => [c.commandId, c.subGroupName]));
    assert.strictEqual(bySubGroup.get("claude-vscode.terminal.open"), "Terminal Commands");
    assert.strictEqual(bySubGroup.get("claude-vscode.editor.open"), "Editor");
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
