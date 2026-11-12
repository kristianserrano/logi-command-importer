import * as assert from "assert";
import {
  discoverCommands,
  extensionDisplayName,
  ExtensionManifestLike,
  FOCUS_VIEW_TITLE_TEMPLATE,
  hasDeclaredCommands,
  localizedText,
  OPEN_VIEW_TITLE_TEMPLATE,
  UNDECLARED_EXTENSION_NAME,
  UNKNOWN_EXTENSION_ID,
  VIEWS_SUBGROUP,
} from "../../discovery";

type Contributes = NonNullable<ExtensionManifestLike["packageJSON"]["contributes"]>;

function ext(id: string, contributes: Contributes, displayName?: ExtensionManifestLike["packageJSON"]["displayName"]): ExtensionManifestLike {
  return { id, packageJSON: { displayName, contributes } };
}

function viewExt(id: string, views: Contributes["views"], viewsContainers?: Contributes["viewsContainers"]) {
  return ext(id, { views, viewsContainers }, "My Extension");
}

/** Registry ids for both generated commands of each view id. */
const focusAndOpen = (...viewIds: string[]) => viewIds.flatMap((v) => [`${v}.focus`, `${v}.open`]);

describe("discovery", () => {
  describe("localizedText", () => {
    it("handles strings, localization objects, and empty/absent values", () => {
      assert.strictEqual(localizedText("  Hi "), "Hi");
      assert.strictEqual(localizedText({ value: "Bonjour", original: "Hi" }), "Bonjour");
      assert.strictEqual(localizedText({ value: "", original: "Hi" }), undefined);
      assert.strictEqual(localizedText("   "), undefined);
      assert.strictEqual(localizedText(undefined), undefined);
    });
  });

  describe("extensionDisplayName / hasDeclaredCommands", () => {
    it("prefers displayName, then name, then id; resolves localization objects and empty values", () => {
      assert.strictEqual(extensionDisplayName({ id: "a.b", packageJSON: { displayName: "Nice", name: "n" } }), "Nice");
      assert.strictEqual(extensionDisplayName({ id: "a.b", packageJSON: { displayName: { value: "Loc", original: "O" } } }), "Loc");
      assert.strictEqual(extensionDisplayName({ id: "a.b", packageJSON: { displayName: "", name: "n" } }), "n");
      assert.strictEqual(extensionDisplayName({ id: "a.b", packageJSON: { displayName: "  ", name: "" } }), "a.b");
    });

    it("reports whether any command is declared", () => {
      assert.ok(hasDeclaredCommands(ext("a.b", { commands: [{ command: "x" }] })));
      assert.ok(!hasDeclaredCommands(ext("a.b", { views: {} })));
    });
  });

  describe("declared commands", () => {
    it("captures title and category as written, resolving localization objects and empty values", () => {
      const result = discoverCommands(
        [
          ext(
            "pub.ext",
            {
              commands: [
                { command: "x.plain", title: "Plain", category: "Cat" },
                { command: "x.loc", title: { value: "Localized", original: "Orig" }, category: { value: "LocCat", original: "C" } },
                { command: "x.empty", title: "", category: "  " },
                { command: "" },
              ],
            },
            "My Extension"
          ),
        ],
        []
      );
      assert.deepStrictEqual(
        result.map((c) => [c.commandId, c.kind, c.title, c.category, c.sourceExtensionId, c.sourceExtensionDisplayName]),
        [
          ["x.plain", "declared", "Plain", "Cat", "pub.ext", "My Extension"],
          ["x.loc", "declared", "Localized", "LocCat", "pub.ext", "My Extension"],
          ["x.empty", "declared", undefined, undefined, "pub.ext", "My Extension"],
        ]
      );
    });

    it("reports a declared command once even when it is also in the registry", () => {
      const result = discoverCommands([ext("pub.ext", { commands: [{ command: "x.a" }] })], ["x.a"]);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].kind, "declared");
    });

    it("prefers declared commands over generated commands with the same id", () => {
      const declared = ext("pub.declared", { commands: [{ command: "myView.focus", title: "Declared title" }] }, "Declared");
      const generated = viewExt("pub.generated", { explorer: [{ id: "myView", name: "My View" }] });

      const result = discoverCommands([declared, generated], ["myView.focus"]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].kind, "declared");
      assert.strictEqual(result[0].sourceExtensionId, "pub.declared");
      assert.strictEqual(result[0].title, "Declared title");
    });
  });

  describe("generated view commands", () => {
    it("emits .focus and .open with titled display names, only when present in the registry", () => {
      const e = viewExt("pub.ext", { explorer: [{ id: "mySidebar", name: "My Sidebar" }] });
      const result = discoverCommands([e], ["mySidebar.focus", "mySidebar.resetViewLocation", "mySidebar.toggleVisibility"]);
      const generated = result.filter((c) => c.kind === "generated");
      assert.deepStrictEqual(generated.map((c) => [c.commandId, c.title]), [
        ["mySidebar.focus", FOCUS_VIEW_TITLE_TEMPLATE.replace("{view}", "My Sidebar")],
      ]);
      assert.strictEqual(FOCUS_VIEW_TITLE_TEMPLATE, "Focus on {view} View");
      assert.strictEqual(OPEN_VIEW_TITLE_TEMPLATE, "Show {view} View");

      const both = discoverCommands([e], focusAndOpen("mySidebar")).filter((c) => c.kind === "generated");
      assert.deepStrictEqual(both.map((c) => c.title), ["Focus on My Sidebar View", "Show My Sidebar View"]);
    });

    it("never synthesizes ids the registry lacks", () => {
      const e = viewExt("pub.ext", { explorer: [{ id: "mySidebar", name: "My Sidebar" }] });
      assert.deepStrictEqual(discoverCommands([e], []), []);
    });

    it("attributes to the declaring extension and leaves other generated variants as undeclared", () => {
      const e = viewExt("pub.ext", { explorer: [{ id: "mySidebar", name: "My Sidebar" }] });
      const result = discoverCommands([e], ["mySidebar.focus", "mySidebar.removeView", "workbench.view.extension.my-sidebar"]);
      const byId = new Map(result.map((c) => [c.commandId, c]));
      assert.strictEqual(byId.get("mySidebar.focus")?.sourceExtensionId, "pub.ext");
      assert.strictEqual(byId.get("mySidebar.focus")?.sourceExtensionDisplayName, "My Extension");
      assert.strictEqual(byId.get("mySidebar.removeView")?.kind, "undeclared");
      assert.strictEqual(byId.get("workbench.view.extension.my-sidebar")?.kind, "undeclared");
    });

    it("skips views with no usable name, resolves localized names, and keeps duplicate names", () => {
      const e = viewExt("pub.ext", {
        explorer: [
          { id: "noName" },
          { id: "emptyName", name: " " },
          { id: "locName", name: { value: "Localized", original: "Orig" } },
          { id: "dupA", name: "Same" },
          { id: "dupB", name: "Same" },
        ],
      });
      const result = discoverCommands([e], focusAndOpen("noName", "emptyName", "locName", "dupA", "dupB"));
      const ids = result.map((c) => c.commandId);
      const kindOf = (id: string) => result.find((c) => c.commandId === id)?.kind;
      assert.strictEqual(kindOf("noName.focus"), "undeclared");
      assert.strictEqual(kindOf("emptyName.open"), "undeclared");
      assert.ok(ids.includes("locName.focus") && ids.includes("dupA.focus") && ids.includes("dupB.focus"));
      const titles = result.filter((c) => c.kind === "generated" && c.commandId.endsWith(".focus")).map((c) => c.title);
      assert.deepStrictEqual(titles, ["Focus on Localized View", "Focus on Same View", "Focus on Same View"]);
    });

    it("uses 'Views' when every view resolves to a single placement", () => {
      const e = viewExt(
        "pub.ext",
        { "my-container": [{ id: "v1", name: "One" }], explorer: [{ id: "v2", name: "Two" }] },
        { activitybar: [{ id: "my-container" }] }
      );
      const generated = discoverCommands([e], focusAndOpen("v1", "v2")).filter((c) => c.kind === "generated");
      assert.ok(generated.every((c) => c.defaultSubGroupName === VIEWS_SUBGROUP));
    });

    it("uses each view's own placement when views span more than one placement", () => {
      const e = viewExt(
        "pub.ext",
        { "side-container": [{ id: "v1", name: "One" }], "panel-container": [{ id: "v2", name: "Two" }], "sec-container": [{ id: "v3", name: "Three" }] },
        { activitybar: [{ id: "side-container" }], panel: [{ id: "panel-container" }], secondarySidebar: [{ id: "sec-container" }] }
      );
      const generated = discoverCommands([e], focusAndOpen("v1", "v2", "v3")).filter((c) => c.kind === "generated");
      const sub = (id: string) => generated.find((c) => c.commandId === id)?.defaultSubGroupName;
      assert.strictEqual(sub("v1.focus"), "Activity Bar");
      assert.strictEqual(sub("v2.open"), "Panel");
      assert.strictEqual(sub("v3.focus"), "Secondary Sidebar");
    });

    it("treats built-in containers as Activity Bar", () => {
      for (const container of ["explorer", "scm", "debug", "test", "remote", "extensions"]) {
        const e = viewExt("pub.ext", { [container]: [{ id: "v1", name: "One" }], "panel-c": [{ id: "v2", name: "Two" }] }, { panel: [{ id: "panel-c" }] });
        const generated = discoverCommands([e], focusAndOpen("v1", "v2")).filter((c) => c.kind === "generated");
        assert.strictEqual(generated.find((c) => c.commandId === "v1.focus")?.defaultSubGroupName, "Activity Bar", container);
        assert.strictEqual(generated.find((c) => c.commandId === "v2.focus")?.defaultSubGroupName, "Panel", container);
      }
    });

    it("resolves a container declared by a different extension", () => {
      const owner = ext("pub.owner", { viewsContainers: { panel: [{ id: "shared-panel" }] } }, "Owner");
      const user = viewExt("pub.user", { "shared-panel": [{ id: "v1", name: "One" }], explorer: [{ id: "v2", name: "Two" }] });
      const generated = discoverCommands([owner, user], focusAndOpen("v1", "v2")).filter((c) => c.kind === "generated");
      assert.strictEqual(generated.find((c) => c.commandId === "v1.focus")?.defaultSubGroupName, "Panel");
      assert.strictEqual(generated.find((c) => c.commandId === "v2.focus")?.defaultSubGroupName, "Activity Bar");
      assert.ok(generated.every((c) => c.sourceExtensionId === "pub.user"));
    });

    it("ignores unknown container location keys and unknown container ids when comparing placements", () => {
      const e = viewExt(
        "pub.ext",
        { "weird-c": [{ id: "v1", name: "One" }], unknownBuiltin: [{ id: "v2", name: "Two" }], explorer: [{ id: "v3", name: "Three" }] },
        { somethingNew: [{ id: "weird-c" }] }
      );
      const generated = discoverCommands([e], focusAndOpen("v1", "v2", "v3")).filter((c) => c.kind === "generated");
      assert.strictEqual(generated.length, 6);
      assert.ok(generated.every((c) => c.defaultSubGroupName === VIEWS_SUBGROUP));
    });

    it("falls back to 'Views' for an unresolved-placement view when others span multiple placements", () => {
      const e = viewExt(
        "pub.ext",
        { "a-c": [{ id: "v1", name: "One" }], "p-c": [{ id: "v2", name: "Two" }], mystery: [{ id: "v3", name: "Three" }] },
        { activitybar: [{ id: "a-c" }], panel: [{ id: "p-c" }] }
      );
      const generated = discoverCommands([e], focusAndOpen("v1", "v2", "v3")).filter((c) => c.kind === "generated");
      assert.strictEqual(generated.find((c) => c.commandId === "v3.focus")?.defaultSubGroupName, VIEWS_SUBGROUP);
    });

    it("computes the subcategory per extension, not globally", () => {
      const multi = viewExt("pub.multi", { "a-c": [{ id: "m1", name: "M1" }], "p-c": [{ id: "m2", name: "M2" }] }, { activitybar: [{ id: "a-c" }], panel: [{ id: "p-c" }] });
      const single = viewExt("pub.single", { explorer: [{ id: "s1", name: "S1" }] });
      const generated = discoverCommands([multi, single], focusAndOpen("m1", "m2", "s1")).filter((c) => c.kind === "generated");
      assert.strictEqual(generated.find((c) => c.commandId === "m1.focus")?.defaultSubGroupName, "Activity Bar");
      assert.strictEqual(generated.find((c) => c.commandId === "s1.focus")?.defaultSubGroupName, VIEWS_SUBGROUP);
    });
  });

  describe("undeclared commands", () => {
    it("classifies remaining registry ids with the sentinel owner and Undeclared name", () => {
      const result = discoverCommands([ext("pub.ext", { commands: [{ command: "a.cmd" }] })], ["a.cmd", "b.dynamic", "b.dynamic"]);
      const undeclared = result.filter((c) => c.kind === "undeclared");
      assert.deepStrictEqual(undeclared.map((c) => [c.commandId, c.sourceExtensionId, c.sourceExtensionDisplayName]), [
        ["b.dynamic", UNKNOWN_EXTENSION_ID, UNDECLARED_EXTENSION_NAME],
      ]);
      assert.strictEqual(UNDECLARED_EXTENSION_NAME, "Undeclared");
    });
  });
});
