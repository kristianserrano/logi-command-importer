# Logi Command Importer

A companion VS Code extension that discovers registered commands from your installed extensions, lets you filter them by namespace, and imports selected commands into the **Logi Command Manager** catalog used by Logi Options+. It is general-purpose: it has no built-in knowledge of any specific extension (including Turbo Console Log) and works with any command namespace you give it.

Its own Command Palette entries are prefixed **"Logi Command Importer: "**, distinct from Logitech's own **"Logi Command Manager"** extension that owns the catalog this tool writes to — this extension is a separate, unofficial companion tool, not part of Logi Options+ itself.

## Supported platforms

- macOS
- Windows
- Linux

## Commands

All commands are available from the Command Palette (`Cmd/Ctrl+Shift+P`):

| Command | Description |
| --- | --- |
| **Logi Command Importer: Import Commands** | Runs the full import flow and writes to the catalog. |
| **Logi Command Importer: Remove Commands** | Lets you select any catalog entry to remove, whether or not this extension imported it. |
| **Logi Command Importer: Find and Replace in Catalog** | One-off bulk cleanup of `displayName`/`groupName` text already in the catalog (e.g. stripping a redundant prefix an extension baked into its own titles), with a full preview before anything is written. |
| **Logi Command Importer: Open Active Logi Catalog** | Opens the resolved `logiActions.json` file for the current platform. |
| **Logi Command Importer: Configure Command Sources** | Opens Settings, scoped to this extension's configuration. |

## Import flow

1. **Pick extensions (optional)** — a multi-select Quick Pick of installed extensions that declare at least one command (themes, keymaps, and other command-less extensions aren't listed, since they'd have nothing to offer). Every command from a checked extension is included. Press Enter with none checked to skip this and search every discovered command instead — the next step's Quick Pick lets you filter it by name, command id, or extension.
2. Review matches in a multi-select Quick Pick. Commands already present in the catalog (matched by `actionName`/command id) are left out automatically, since re-selecting one would just be skipped as a duplicate on import anyway. Each remaining item shows the inferred display name, the raw command ID (as the description), and the source extension plus proposed group/subgroup (as the detail line). Type to filter by any of those — matching is a literal, case-insensitive substring, not VS Code's usual fuzzy filter (which can match on scattered characters in any order and gets confusing fast on a list of near-identical namespaced command ids).
3. Select the commands to import.
4. Confirm. The extension reports how many entries were added and how many were skipped as duplicates.

A `namespacePrefixes` setting is still available to always additionally include commands matching a configured prefix, but there's no dedicated prompt for it in the flow — set it once via **Configure Command Sources** if you want it, rather than typing it in on every import.

There's no separate preview/dry-run command — the review step above already shows exactly what would be imported (display name, command id, source extension, group/subgroup) before you commit to anything, and already-cataloged commands are excluded from it entirely, so there's nothing further a preview step would add.

## Command discovery

Commands are discovered from two sources:

- **Extension manifests** — `contributes.commands` in every installed extension's `package.json`. This is the primary source and gives you a friendly title and category when the extension declares one.
- **The live VS Code command registry** — `vscode.commands.getCommands(true)`. Any registered command not declared in a manifest (e.g. dynamically registered commands) is still discoverable so it can be matched by namespace or by extension. The registry API doesn't expose which extension owns a command id, so its source extension is resolved in order of confidence: (1) exact view/view-container ownership, from every installed extension's `contributes.views`/`contributes.viewsContainers` — this is what correctly attributes VS Code's auto-generated per-view commands (`<viewId>.focus`, `<viewId>.open`, `<viewId>.resetViewLocation`, `<viewId>.removeView`, `<viewId>.toggleVisibility`) and per-container commands (`workbench.view.extension.<containerId>` and its `.resetViewContainerLocation` counterpart) back to their real owning extension, even though those commands share no namespace with that extension's own declared commands at all; (2) sibling manifest-declared commands sharing the same namespace root (e.g. `claude-vscode.toggleDictation`, undeclared, is attributed to whichever extension declared `claude-vscode.logout` and the rest of that root); (3) falls back to an "Other" source only when neither resolves anything, or when a namespace root is shared by more than one extension (never guessed at).

### Searching by extension

Namespace prefixes and source extensions are independent, either/or ways to find commands — a command is a candidate if it matches *either* a configured namespace prefix *or* one of the extensions you picked, not both at once. This matters because some of an extension's real commands (its auto-generated view/container commands, described above) share no namespace with the extension's own declared commands, so a namespace prefix alone can't find them; picking the extension directly can. Persist a default set of extensions via the `sourceExtensionFilters` setting to pre-check them in the picker every time. Leaving both unset (no extensions checked, no `namespacePrefixes` configured) doesn't mean "nothing matches" — it means every discovered command becomes a candidate, so the review step's search box does the narrowing instead.

### Excluded: VS Code's auto-generated view/container commands

One category is excluded from candidates, always, with no override: VS Code's own auto-generated per-view and per-container commands (`<viewId>.focus`, `.open`, `.resetViewLocation`, `.removeView`, `.toggleVisibility`, and `workbench.view.extension.<containerId>` / `.resetViewContainerLocation`). These are never declared in any manifest, never appear in the Command Palette (VS Code only shows commands declared through `contributes.commands`), and Logi's own default catalog contains zero of them — so there's no realistic case for wanting one in the Logi catalog. Anyone who genuinely wants one can add it directly in Logi Options+ itself.

This exclusion is an *exact match* against real declared view/container ids (from `contributes.views`/`viewsContainers`, the same data used for source-extension resolution above) — not a suffix guess. That distinction matters: an earlier, suffix-based version of this filter (checking whether a command id merely *ended in* `.open` or similar) caused real false positives, hiding deliberately-authored commands like "Open in Terminal" purely because its id happened to end the same way a generated command's does. Matching against the actual declared view/container id instead means a command is only ever excluded when it's genuinely one of VS Code's generated commands — `claude-vscode.terminal.open` (a real, titled command) is never affected, while `claudeVSCodeSidebar.focus` (the auto-generated command for a declared view named `claudeVSCodeSidebar`) always is. Everything else — however "generated-looking" it may seem by name alone — is left for you to decide about in the Quick Pick.

## Naming and grouping

- **Display names** use the command's manifest-declared `title` verbatim when available — that text is the extension author's own deliberate wording (including whatever prefix, or lack of one, they chose to type into it), so this extension doesn't try to rewrite or "clean up" names. Different commands from the same extension can end up inconsistently titled if the author wrote them that way; use `displayNameOverrides` if you want a specific one changed. When no title is declared at all, the name is inferred from the command ID's final dot-separated segment, splitting camelCase, punctuation, underscores, and hyphens into words and title-casing them (acronyms like `URL` are preserved). Example: `turboConsoleLog.displayLogMessage` → "Display Log Message".
- **Groups** default to the source extension's display name (e.g. "Git", "Turbo Console Log"), or "Other" when unavailable.
- **Subgroups** default to the longest matching configured `subGroupRules` prefix. If none matches, whichever namespace prefix actually applies to the command is stripped first, and whatever nested namespace remains becomes the subgroup — so a top-level command like `claude-vscode.acceptChange` gets no subgroup, while a nested one like `claude-vscode.editor.open` gets subgroup "Editor", rather than every command repeating the extension's own namespace root as a redundant subgroup. The prefix that applies is either one you searched by, or — for extension-based search, where nothing was typed — each extension's own predominant namespace root, inferred from its own manifest-declared commands (e.g. an extension with 28 commands under `claude-vscode.` and 3 under `claude-code.` gets `claude-vscode.` as its inferred root; the 3 minority-root commands simply get no default subgroup, same as any command that doesn't match an applicable prefix). Expected to be rare, and editable via `subGroupRules` or the Quick Pick review step when it happens.
- All of the above can be overridden per command ID via configuration, or edited inline for a single import in the Quick Pick review step.

None of this logic is specific to any one extension — it applies uniformly to whatever namespace prefixes you provide.

## Logi catalog integration

### Catalog paths

The extension resolves the Logi Command Manager catalog using the `logi-sw.logiactions` global storage id:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Code/User/globalStorage/logi-sw.logiactions/logiActions.json` |
| Windows | `%APPDATA%\Code\User\globalStorage\logi-sw.logiactions\logiActions.json` |
| Linux | `~/.config/Code/User/globalStorage/logi-sw.logiactions/logiActions.json` |

### Catalog entry schema

```json
{
  "selected": true,
  "actionName": "git.commit",
  "groupName": "Git",
  "displayName": "Commit",
  "subGroupName": null
}
```

### Safety guarantees

- **Preserves existing entries.** Imports and removals only ever add or remove specific entries by `actionName`; everything else in the catalog is left untouched.
- **No duplicate `actionName` values.** Candidates whose `actionName` already exists in the catalog are skipped and reported as duplicates, not overwritten.
- **Timestamped backups.** Every write to the catalog first copies the existing file to `logiActions.backup-<ISO-timestamp>.json` in the same directory (if a catalog already exists — there's nothing to back up on the very first write).

## Removal

**Remove Commands** lists every entry currently in the catalog — Logi's own defaults, entries this extension imported, and anything else, such as commands another extension or the user added directly in Logi Options+. Nothing is removed unless you explicitly select it, and a timestamped backup is taken before every write — that explicit-selection-plus-backup pairing is the safety net, not a restriction on which entries are eligible. If you remove something by mistake (including one of Logi's own defaults), it can simply be re-added — either through this extension's import flow, if it's a discoverable VS Code command, or directly in Logi Options+.

The extension doesn't track which entries it created (there's no companion metadata file) — `logiActions.json` has no field for that anyway, and since removal isn't gated by origin, there was nothing left for that tracking to do.

## Bulk find and replace

**Find and Replace in Catalog** is a one-off cleanup tool for text already sitting in the catalog — e.g. an extension baked a redundant `"Claude Code: "` or `"Turbo Console Log: "` prefix into many of its command titles, and you'd rather not see it repeated everywhere. The flow:

1. Choose which field to search: Display Name, Group Name, or Both.
2. Enter the text to find (a literal match, not a regular expression — no escaping to think about) and what to replace it with (leave blank to remove it entirely).
3. Every entry that would actually change is shown in a preview, old value → new value, all pre-checked — uncheck anything you don't want touched.
4. Confirm. Only the checked entries are updated, with the same timestamped backup as every other write.

This is scoped specifically to `displayName`/`groupName` — never `actionName`, which Logi correlates to a real command and has to stay exact, unlike a blunt text-editor find/replace across the whole file (which has no way to know the difference between the two).

For a rule you want applied automatically to every *future* import instead of a one-off cleanup of what's already there, see the `displayNameFindReplace`/`groupNameFindReplace` settings below.

## Configuration

All settings live under `logiCommandImporter.*` and can be edited via **Logi Command Importer: Configure Command Sources** or directly in `settings.json`:

| Setting | Type | Description | Example |
| --- | --- | --- | --- |
| `namespacePrefixes` | `string[]` | Default namespace prefixes to pre-fill in the import prompt. | `["myExtension.", "workbench.action."]` |
| `displayNameOverrides` | `object` | Map of command ID → explicit display name. | `{ "myExtension.doTheThing": "Do The Thing (Legacy)" }` |
| `groupNameOverrides` | `object` | Map of command ID → explicit Logi group name. | `{ "myExtension.doTheThing": "My Extension" }` |
| `subGroupRules` | `string` (one `prefix\|subGroupName` pair per line) | Rules mapping a command ID prefix to a subgroup name. The longest matching prefix wins. | `myExtension.insert\|Insert Commands` |
| `sourceExtensionFilters` | `string[]` | Extension IDs to search by, in addition to namespace prefixes — every command from these extensions is included, regardless of namespace. Pre-fills the "Search by extension" Quick Pick; empty means no extension-based search by default. | `["somePublisher.myExtension"]` |
| `selectedByDefault` | `boolean` | Whether newly imported catalog entries have `"selected": true`. Defaults to `true`. | `true` |
| `displayNameFindReplace` | `string` (one `find\|replace` pair per line) | Literal find/replace rules applied to *inferred* display names on every future import (never to an explicit `displayNameOverrides` entry). Rules apply in the order written. | `MyExtension: \|` |
| `groupNameFindReplace` | `string` (one `find\|replace` pair per line) | Literal find/replace rules applied to *derived* group names on every future import (never to an explicit `groupNameOverrides` entry). | ` for VS Code\|` |

Full example, as it would appear in `settings.json`:

```json
{
  "logiCommandImporter.namespacePrefixes": ["myExtension.", "myExtensionPro."],
  "logiCommandImporter.displayNameOverrides": {
    "myExtension.doTheThing": "Do The Thing (Legacy)"
  },
  "logiCommandImporter.groupNameOverrides": {
    "myExtension.doTheThing": "My Extension"
  },
  "logiCommandImporter.subGroupRules": "myExtension.insert|Insert Commands\nmyExtensionPro.|Pro Tools",
  "logiCommandImporter.sourceExtensionFilters": ["somePublisher.myExtension"],
  "logiCommandImporter.selectedByDefault": true,
  "logiCommandImporter.displayNameFindReplace": "MyExtension: |",
  "logiCommandImporter.groupNameFindReplace": " for VS Code|"
}
```

## Building

```bash
npm install
npm run compile     # type-check and build to dist/
npm run test:unit    # run the unit test suite
npm run package      # produce a .vsix using @vscode/vsce
```

The resulting `logi-command-importer-<version>.vsix` is a standalone, distributable package — no other repo or extension is required to build or install it.

## Testing approach

Unit tests never touch a real Logi catalog. Catalog tests write to fresh temporary directories (`fs.mkdtempSync` under the OS temp directory) that are unique per test and are never the real `globalStorage` path. Path-resolution tests pass explicit platform/home/APPDATA values rather than reading the real environment, so macOS, Windows, and Linux resolution are all verified regardless of the platform running the tests.

Coverage includes: manifest command discovery, command-less extension detection (for filtering themes/keymaps/etc. out of the extension picker), view/view-container ownership discovery, generated-view/container command detection (exact id matching, including the false-positive case a suffix-only check would get wrong), predominant-namespace-root inference per extension (including the minority-root straggler case), registry-command merging (source-extension resolution via view/container ownership and sibling namespace root, plus their ambiguous/no-match fallbacks), namespace filtering, source-extension inclusion (as an independent OR criterion, not a narrowing filter), already-cataloged exclusion, literal-match logic (the pure `matchesLiteralQuery`/`buildSearchText` functions), literal find/replace logic (`applyFindReplaceRules`, including multi-rule ordering and treating `find` as literal text rather than a regular expression), line-delimited `prefix|value`/`find|replace` settings parsing (`parseLineDelimitedPairs` — splitting only on the first `|` per line, preserving meaningful whitespace in the text before it, and skipping blank or malformed lines without discarding the rest), bulk catalog find/replace (`performFindReplace` — only explicitly-selected entries updated, no-op updates neither counted nor written, backup only when something actually changes), find/replace applied to inferred names during import while explicit overrides stay untouched, display-name inference, default grouping and subgrouping (including configured rule precedence and inferred-root vs. matched-prefix precedence), configuration overrides, duplicate handling, catalog read/write/backup/merge, removal (any explicitly requested entry, leaving non-requested entries untouched), and cross-platform catalog path resolution.

One known gap: the actual `vscode.window.createQuickPick` wiring in `extension.ts` (how the literal filter is applied to a live Quick Pick, `matchOnDescription`/`matchOnDetail` configuration, checked-state reconciliation across re-filters) isn't exercised by the unit suite, since it requires a running VS Code host. A real bug lived here once — `createQuickPick` applies its own built-in filter on top of whatever `.items` are assigned, and by default that only checks `label`; without explicitly enabling `matchOnDescription`/`matchOnDetail`, an item correctly matched via `description` or `detail` alone (e.g. a command's `actionName` or group name containing the query, but not its display name) would get silently re-hidden by VS Code's own pass. Worth remembering if this code is touched again.

## Limitations

- Discovery relies on `contributes.commands` and the live command registry; a command that is registered purely at runtime with no manifest entry will only appear if the command registry exposes it while the import flow runs (i.e. after the owning extension has activated).
- The extension does not attempt to launch or activate other extensions to force command registration — if a command isn't registered yet, it won't be discoverable until it is.
- Duplicate `actionName` values are always skipped rather than merged or overwritten, even if the proposed group/subgroup/display name differs from what's already in the catalog.
- Removal is matched by `actionName`, so manually renaming an entry in the catalog will make it a different entry as far as this extension is concerned.
- Removal has no origin restriction — it's possible to remove one of Logi's own default entries through this extension, same as you already can directly in Logi Options+. Anything removed by mistake can be re-added.
