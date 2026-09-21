import * as assert from "assert";
import {
  discoverManifestCommands,
  discoverViewOwnership,
  hasDeclaredCommands,
  inferPredominantNamespaceRoots,
  isGeneratedViewOrContainerCommand,
  mergeRegistryCommands,
} from "../../discovery";

describe("discovery", () => {
  describe("discoverManifestCommands", () => {
    it("collects commands from contributes.commands across extensions", () => {
      const result = discoverManifestCommands([
        {
          id: "publisher.turboConsoleLog",
          packageJSON: {
            displayName: "Turbo Console Log",
            contributes: {
              commands: [
                { command: "turboConsoleLog.displayLogMessage", title: "Insert Log Message" },
                { command: "turboConsoleLog.commentAllLogMessages" },
              ],
            },
          },
        },
        {
          id: "vscode.git",
          packageJSON: {
            displayName: "Git",
            contributes: { commands: [{ command: "git.commit", title: "Commit" }] },
          },
        },
      ]);

      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(
        result.map((r) => r.commandId),
        ["turboConsoleLog.displayLogMessage", "turboConsoleLog.commentAllLogMessages", "git.commit"]
      );
      assert.strictEqual(result[0].sourceExtensionDisplayName, "Turbo Console Log");
      assert.strictEqual(result[0].sourceExtensionId, "publisher.turboConsoleLog");
    });

    it("falls back to package name, then extension id, when displayName is missing", () => {
      const withName = discoverManifestCommands([
        {
          id: "pub.ext",
          packageJSON: { name: "ext-name", contributes: { commands: [{ command: "ext.cmd" }] } },
        },
      ]);
      assert.strictEqual(withName[0].sourceExtensionDisplayName, "ext-name");

      const withNeither = discoverManifestCommands([
        { id: "pub.ext2", packageJSON: { contributes: { commands: [{ command: "ext2.cmd" }] } } },
      ]);
      assert.strictEqual(withNeither[0].sourceExtensionDisplayName, "pub.ext2");
    });

    it("skips contributions with no command id and extensions with no contributed commands", () => {
      const result = discoverManifestCommands([
        { id: "pub.a", packageJSON: { contributes: { commands: [{ command: "" } as any] } } },
        { id: "pub.b", packageJSON: {} },
      ]);
      assert.strictEqual(result.length, 0);
    });
  });

  describe("mergeRegistryCommands", () => {
    it("adds registry-only commands under an Unknown/Other source", () => {
      const manifestCommands = discoverManifestCommands([
        { id: "pub.a", packageJSON: { displayName: "A", contributes: { commands: [{ command: "a.cmd" }] } } },
      ]);
      const merged = mergeRegistryCommands(manifestCommands, ["a.cmd", "b.dynamicCmd"]);

      assert.strictEqual(merged.length, 2);
      const dynamic = merged.find((c) => c.commandId === "b.dynamicCmd");
      assert.ok(dynamic);
      assert.strictEqual(dynamic!.sourceExtensionId, "unknown");
      assert.strictEqual(dynamic!.sourceExtensionDisplayName, "Other");
    });

    it("does not duplicate commands already known from a manifest", () => {
      const manifestCommands = discoverManifestCommands([
        { id: "pub.a", packageJSON: { displayName: "A", contributes: { commands: [{ command: "a.cmd" }] } } },
      ]);
      const merged = mergeRegistryCommands(manifestCommands, ["a.cmd"]);
      assert.strictEqual(merged.length, 1);
      assert.strictEqual(merged[0].sourceExtensionId, "pub.a");
    });

    it("flags a registry-only command as generated when it exactly matches a declared view id and suffix", () => {
      const extensions = [
        {
          id: "anthropic.claude-vscode",
          packageJSON: {
            displayName: "Claude Code for VS Code",
            contributes: {
              commands: [{ command: "claude-vscode.terminal.open", title: "Open in Terminal" }],
              views: { "claude-sidebar": [{ id: "claudeVSCodeSidebar" }] },
            },
          },
        },
      ];
      const manifestCommands = discoverManifestCommands(extensions);
      const viewOwnership = discoverViewOwnership(extensions);
      const merged = mergeRegistryCommands(
        manifestCommands,
        ["claude-vscode.terminal.open", "claudeVSCodeSidebar.focus"],
        viewOwnership
      );

      const declared = merged.find((c) => c.commandId === "claude-vscode.terminal.open");
      assert.strictEqual(declared?.isGenerated, undefined);

      const generated = merged.find((c) => c.commandId === "claudeVSCodeSidebar.focus");
      assert.strictEqual(generated?.isGenerated, true);
    });

    it("attributes a registry-only command to the same source extension as sibling manifest commands sharing its namespace root", () => {
      // Reproduces claude-vscode.toggleDictation: registered dynamically with no package.json
      // entry, but sharing the "claude-vscode" root with 31 declared sibling commands.
      const manifestCommands = discoverManifestCommands([
        {
          id: "anthropic.claude-vscode",
          packageJSON: {
            displayName: "Claude Code for VS Code",
            contributes: { commands: [{ command: "claude-vscode.logout" }, { command: "claude-vscode.showLogs" }] },
          },
        },
      ]);
      const merged = mergeRegistryCommands(manifestCommands, [
        "claude-vscode.logout",
        "claude-vscode.showLogs",
        "claude-vscode.toggleDictation",
      ]);

      const dynamic = merged.find((c) => c.commandId === "claude-vscode.toggleDictation");
      assert.ok(dynamic);
      assert.strictEqual(dynamic!.sourceExtensionId, "anthropic.claude-vscode");
      assert.strictEqual(dynamic!.sourceExtensionDisplayName, "Claude Code for VS Code");
    });

    it("falls back to Other when a namespace root is shared by more than one extension, rather than guessing", () => {
      const manifestCommands = discoverManifestCommands([
        { id: "pub.a", packageJSON: { displayName: "Extension A", contributes: { commands: [{ command: "shared.cmdOne" }] } } },
        { id: "pub.b", packageJSON: { displayName: "Extension B", contributes: { commands: [{ command: "shared.cmdTwo" }] } } },
      ]);
      const merged = mergeRegistryCommands(manifestCommands, ["shared.cmdOne", "shared.cmdTwo", "shared.dynamicCmd"]);

      const dynamic = merged.find((c) => c.commandId === "shared.dynamicCmd");
      assert.ok(dynamic);
      assert.strictEqual(dynamic!.sourceExtensionId, "unknown");
      assert.strictEqual(dynamic!.sourceExtensionDisplayName, "Other");
    });

    it("falls back to Other for a registry-only command with no manifest sibling under any namespace root", () => {
      const manifestCommands = discoverManifestCommands([
        { id: "pub.a", packageJSON: { displayName: "A", contributes: { commands: [{ command: "a.cmd" }] } } },
      ]);
      const merged = mergeRegistryCommands(manifestCommands, ["a.cmd", "totallyUnrelated.dynamicCmd"]);

      const dynamic = merged.find((c) => c.commandId === "totallyUnrelated.dynamicCmd");
      assert.ok(dynamic);
      assert.strictEqual(dynamic!.sourceExtensionDisplayName, "Other");
    });

    it("attributes a per-view auto-generated command to the extension that declared the view, via view ownership", () => {
      // Reproduces claudeVSCodeSidebar.focus/.open/.resetViewLocation — none declared in
      // contributes.commands (VS Code generates them at runtime), but the view id
      // "claudeVSCodeSidebar" is declared directly in the extension's own contributes.views.
      const extensions = [
        {
          id: "anthropic.claude-vscode",
          packageJSON: {
            displayName: "Claude Code for VS Code",
            contributes: {
              commands: [{ command: "claude-vscode.logout" }],
              views: { "claude-sidebar": [{ id: "claudeVSCodeSidebar" }] },
            },
          },
        },
      ];
      const manifestCommands = discoverManifestCommands(extensions);
      const viewOwnership = discoverViewOwnership(extensions);
      const merged = mergeRegistryCommands(
        manifestCommands,
        ["claude-vscode.logout", "claudeVSCodeSidebar.focus", "claudeVSCodeSidebar.open", "claudeVSCodeSidebar.resetViewLocation"],
        viewOwnership
      );

      for (const suffix of ["focus", "open", "resetViewLocation"]) {
        const entry = merged.find((c) => c.commandId === `claudeVSCodeSidebar.${suffix}`);
        assert.ok(entry, `missing claudeVSCodeSidebar.${suffix}`);
        assert.strictEqual(entry!.sourceExtensionId, "anthropic.claude-vscode");
        assert.strictEqual(entry!.sourceExtensionDisplayName, "Claude Code for VS Code");
      }
    });

    it("attributes a view-container auto-generated command to the extension that declared the container, via view ownership", () => {
      // Reproduces workbench.view.extension.claude-sidebar and its
      // .resetViewContainerLocation counterpart, from contributes.viewsContainers.
      const extensions = [
        {
          id: "anthropic.claude-vscode",
          packageJSON: {
            displayName: "Claude Code for VS Code",
            contributes: {
              commands: [{ command: "claude-vscode.logout" }],
              viewsContainers: { activitybar: [{ id: "claude-sidebar" }] },
            },
          },
        },
      ];
      const manifestCommands = discoverManifestCommands(extensions);
      const viewOwnership = discoverViewOwnership(extensions);
      const merged = mergeRegistryCommands(
        manifestCommands,
        [
          "claude-vscode.logout",
          "workbench.view.extension.claude-sidebar",
          "workbench.view.extension.claude-sidebar.resetViewContainerLocation",
        ],
        viewOwnership
      );

      const openContainer = merged.find((c) => c.commandId === "workbench.view.extension.claude-sidebar");
      assert.ok(openContainer);
      assert.strictEqual(openContainer!.sourceExtensionId, "anthropic.claude-vscode");

      const resetContainer = merged.find(
        (c) => c.commandId === "workbench.view.extension.claude-sidebar.resetViewContainerLocation"
      );
      assert.ok(resetContainer);
      assert.strictEqual(resetContainer!.sourceExtensionId, "anthropic.claude-vscode");
    });

    it("prefers exact view ownership over the sibling-namespace-root fallback", () => {
      // If a view id happened to also look like a namespace root shared with a different
      // extension's manifest commands, the exact view-ownership match should win.
      const extensions = [
        {
          id: "pub.viewOwner",
          packageJSON: {
            displayName: "View Owner",
            contributes: { views: { someContainer: [{ id: "sharedRoot" }] } },
          },
        },
        {
          id: "pub.siblingOwner",
          packageJSON: {
            displayName: "Sibling Owner",
            contributes: { commands: [{ command: "sharedRoot.declaredCommand" }] },
          },
        },
      ];
      const manifestCommands = discoverManifestCommands(extensions);
      const viewOwnership = discoverViewOwnership(extensions);
      const merged = mergeRegistryCommands(
        manifestCommands,
        ["sharedRoot.declaredCommand", "sharedRoot.focus"],
        viewOwnership
      );

      const viewCommand = merged.find((c) => c.commandId === "sharedRoot.focus");
      assert.ok(viewCommand);
      assert.strictEqual(viewCommand!.sourceExtensionId, "pub.viewOwner");
    });
  });

  describe("discoverViewOwnership", () => {
    it("maps declared view and view container ids to the extension that declared them", () => {
      const ownership = discoverViewOwnership([
        {
          id: "anthropic.claude-vscode",
          packageJSON: {
            displayName: "Claude Code for VS Code",
            contributes: {
              views: {
                "claude-sidebar": [{ id: "claudeVSCodeSidebar" }],
                "claude-sessions-sidebar": [{ id: "claudeVSCodeSessionsList" }],
              },
              viewsContainers: { activitybar: [{ id: "claude-sidebar" }] },
            },
          },
        },
      ]);

      assert.deepStrictEqual(ownership.viewIdToSource.get("claudeVSCodeSidebar"), {
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
      });
      assert.deepStrictEqual(ownership.viewIdToSource.get("claudeVSCodeSessionsList"), {
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
      });
      assert.deepStrictEqual(ownership.containerIdToSource.get("claude-sidebar"), {
        sourceExtensionId: "anthropic.claude-vscode",
        sourceExtensionDisplayName: "Claude Code for VS Code",
      });
    });

    it("returns empty maps for extensions with no declared views or containers", () => {
      const ownership = discoverViewOwnership([
        { id: "pub.a", packageJSON: { displayName: "A", contributes: { commands: [{ command: "a.cmd" }] } } },
      ]);
      assert.strictEqual(ownership.viewIdToSource.size, 0);
      assert.strictEqual(ownership.containerIdToSource.size, 0);
    });
  });

  describe("isGeneratedViewOrContainerCommand", () => {
    const ownership = discoverViewOwnership([
      {
        id: "anthropic.claude-vscode",
        packageJSON: {
          displayName: "Claude Code for VS Code",
          contributes: {
            views: { "claude-sidebar": [{ id: "claudeVSCodeSidebar" }] },
            viewsContainers: { activitybar: [{ id: "claude-sidebar" }] },
          },
        },
      },
    ]);

    it("recognizes every auto-generated per-view command suffix for a known view id", () => {
      for (const suffix of ["focus", "open", "resetViewLocation", "removeView", "toggleVisibility"]) {
        assert.ok(
          isGeneratedViewOrContainerCommand(`claudeVSCodeSidebar.${suffix}`, ownership),
          `expected claudeVSCodeSidebar.${suffix} to be recognized as generated`
        );
      }
    });

    it("recognizes the container-level open and resetViewContainerLocation commands for a known container id", () => {
      assert.ok(isGeneratedViewOrContainerCommand("workbench.view.extension.claude-sidebar", ownership));
      assert.ok(
        isGeneratedViewOrContainerCommand("workbench.view.extension.claude-sidebar.resetViewContainerLocation", ownership)
      );
    });

    it("does not match a deliberate, titled command that merely ends in the same suffix as a generated one", () => {
      // Reproduces the exact false-positive that broke the earlier suffix-only heuristic:
      // "claude-vscode.terminal.open" is a real, titled command ("Open in Terminal"), and
      // "claude-vscode.terminal" was never declared as a view id — only "claudeVSCodeSidebar" was.
      assert.ok(!isGeneratedViewOrContainerCommand("claude-vscode.terminal.open", ownership));
    });

    it("does not match commands unrelated to any declared view or container", () => {
      assert.ok(!isGeneratedViewOrContainerCommand("git.commit", ownership));
      assert.ok(!isGeneratedViewOrContainerCommand("workbench.action.debug.stop", ownership));
    });
  });

  describe("inferPredominantNamespaceRoots", () => {
    it("picks the root shared by the most of an extension's own declared commands", () => {
      // Reproduces claude-vscode's real manifest: 28 commands under "claude-vscode.", 3 under
      // "claude-code." — the minority root should not win.
      const manifestCommands = discoverManifestCommands([
        {
          id: "anthropic.claude-vscode",
          packageJSON: {
            displayName: "Claude Code for VS Code",
            contributes: {
              commands: [
                { command: "claude-vscode.logout" },
                { command: "claude-vscode.showLogs" },
                { command: "claude-vscode.terminal.open" },
                { command: "claude-code.acceptProposedDiff" },
              ],
            },
          },
        },
      ]);

      const roots = inferPredominantNamespaceRoots(manifestCommands);
      assert.strictEqual(roots.get("anthropic.claude-vscode"), "claude-vscode.");
    });

    it("infers a separate predominant root per extension", () => {
      const manifestCommands = discoverManifestCommands([
        { id: "pub.a", packageJSON: { displayName: "A", contributes: { commands: [{ command: "a.one" }, { command: "a.two" }] } } },
        { id: "vscode.git", packageJSON: { displayName: "Git", contributes: { commands: [{ command: "git.commit" }] } } },
      ]);

      const roots = inferPredominantNamespaceRoots(manifestCommands);
      assert.strictEqual(roots.get("pub.a"), "a.");
      assert.strictEqual(roots.get("vscode.git"), "git.");
    });

    it("returns an empty map when no manifest commands have a namespace root at all", () => {
      const manifestCommands = discoverManifestCommands([
        { id: "pub.a", packageJSON: { displayName: "A", contributes: { commands: [{ command: "format" }] } } },
      ]);
      assert.strictEqual(inferPredominantNamespaceRoots(manifestCommands).size, 0);
    });
  });

  describe("hasDeclaredCommands", () => {
    it("returns true for an extension that declares at least one command", () => {
      assert.ok(
        hasDeclaredCommands({
          id: "vscode.git",
          packageJSON: { displayName: "Git", contributes: { commands: [{ command: "git.commit" }] } },
        })
      );
    });

    it("returns false for a theme (or other) extension with no declared commands", () => {
      assert.ok(
        !hasDeclaredCommands({
          id: "pub.a-nice-theme",
          packageJSON: { displayName: "A Nice Theme", contributes: {} },
        })
      );
    });

    it("returns false for an extension with an empty commands array", () => {
      assert.ok(
        !hasDeclaredCommands({
          id: "pub.b",
          packageJSON: { displayName: "B", contributes: { commands: [] } },
        })
      );
    });

    it("returns false for an extension with no contributes block at all", () => {
      assert.ok(!hasDeclaredCommands({ id: "pub.c", packageJSON: { displayName: "C" } }));
    });

    it("returns false for an extension that declares views but no commands", () => {
      // Declaring only views (no commands) still means hasDeclaredCommands is false — the only
      // thing such an extension could offer is auto-generated view commands, which are always
      // excluded anyway, so it correctly has nothing to import either way.
      assert.ok(
        !hasDeclaredCommands({
          id: "pub.d",
          packageJSON: { displayName: "D", contributes: { views: { someContainer: [{ id: "someView" }] } } },
        })
      );
    });
  });
});
