# Design and porting notes

Audience: engineers porting this logic into the Logi Command Manager extension. User-facing behavior is in [../README.md](../README.md); this document records how it works and why.

## 1. Purpose and scope

Let a user pick commands registered by other VS Code extensions and add them to the Logi Command Manager catalog (`logiActions.json`) so they can be bound to Logi Options+ devices. Also: remove entries, and bulk-edit `displayName`/`groupName` text already in the catalog.

In scope: command discovery, naming/grouping, catalog read/merge/write with backup. Out of scope: activating other extensions, anything about Options+ itself, editing `actionName` or `selected` after import.

## 2. Module map

PURE means no `vscode` import (unit-testable under plain mocha).

| File | Kind | Role |
| --- | --- | --- |
| `types.ts` | PURE | `CatalogEntry`, `DiscoveredCommand`, `CandidateEntry`, `ImporterConfig`, defaults. |
| `constants.ts` | PURE | Setting keys, command ids, display separators. Must match `package.json`. |
| `formatting.ts` | PURE | Category-label, pluralization, and backup-note message helpers. |
| `config.ts` | PURE | `mergeConfig`: partial settings over defaults (`undefined`/`null` fall back to the default). |
| `catalogPaths.ts` | PURE (uses `path`) | `resolveCatalogPath` from explicit platform/homedir/APPDATA. |
| `catalogIO.ts` | PURE (uses `fs`) | Read, write with backup, `mergeEntries`, `removeEntries`. |
| `importService.ts` | PURE (uses `fs`) | `performImport`, `performRemoval`, `performFindReplace`: read, transform, write. |
| `discovery.ts` | PURE | `discoverCommands`: declared, generated, and undeclared command discovery from manifests plus registry ids. |
| `filtering.ts` | PURE | Namespace-prefix and source-extension predicates. |
| `candidates.ts` | PURE | `buildCandidates` (filter plus naming), `excludeAlreadyCataloged`. |
| `naming.ts` | PURE | Name inference and category/subcategory derivation. |
| `findReplace.ts` | PURE | Literal find/replace, `computeFindReplaceChanges` (bulk-edit planning and preview text), and the `prefix\|value` line-settings parser. |
| `literalFilter.ts` | PURE | Literal substring match used by the Quick Pick filter. |
| `quickPick.ts` | VS CODE UI | Literal-filter multi-select Quick Pick wrapper. |
| `extension.ts` | VS CODE UI | `activate`/`deactivate` and command registration only. |
| `flows/importFlow.ts`, `removeFlow.ts`, `findReplaceFlow.ts`, `openFlows.ts` | VS CODE UI | One file per command: prompts, pickers, result messages. |
| `flows/shared.ts` | VS CODE UI | Reads settings, resolves the catalog path from `process`/`os`, gathers installed extensions, runs discovery. |

Everything with business logic is PURE; the VS Code layer only gathers inputs (`vscode.extensions.all`, `vscode.commands.getCommands(true)`, settings) and shows pickers.

## 3. Data flow

**Import**
1. Read settings, parse line-delimited settings (`subGroupRules`, `*FindReplace`) via `parseLineDelimitedPairs`.
2. Extension picker (pre-checks `sourceExtensionFilters`); the checked ids replace `sourceExtensionFilters` for this run. `namespacePrefixes` come from settings only; there is no prefix prompt.
3. `discoverCommands` (declared + generated + undeclared, using manifests and the live registry; see section 5).
4. `buildCandidates`: apply the inclusion rule and naming.
5. `readCatalog`, then `excludeAlreadyCataloged`.
6. Review picker; user selects.
7. `performImport`: read catalog, map candidates to entries, `mergeEntries`, `writeCatalog` (backup first).

**Remove:** read catalog, list all entries, user selects, `performRemoval` (`removeEntries`, backup, write only if something was removed).

**Find/replace:** user picks field(s), find, replace; `computeFindReplaceChanges` computes new values for every entry; changed entries are previewed (all pre-checked); `performFindReplace` applies only the checked updates, skips no-ops, backs up only if something changes.

## 4. Catalog schema and invariants

```json
{ "selected": true, "actionName": "git.commit", "groupName": "Git", "displayName": "Commit", "subGroupName": null }
```

The file is a JSON array of these. An empty or missing file is treated as an empty catalog; a non-array throws.

Invariants the code relies on:

- `actionName` is the VS Code command id. It must be unique and is compared case-sensitively (`mergeEntries` uses a `Set` of exact strings; this was chosen to match Logi's own semantics, which is unconfirmed - see open questions).
- Unrelated entries are preserved verbatim, including any fields this code does not know about. Import appends; removal filters by `actionName`; find/replace spreads the existing entry and changes only `displayName`/`groupName`.
- A timestamped backup (`logiActions.backup-<ISO with : and . replaced by ->.json`, same directory) is written before every write, if the file already exists. No backup on first creation. After each write only the newest `MAX_BACKUPS` (10) backups are kept; pruning matches this module's exact naming pattern, so no other file can be deleted, and a failed delete never fails the write.
- Find/replace never touches `actionName`, since Logi correlates it to a real command.
- Duplicates are skipped, never overwritten or merged.
- The file is written as pretty-printed JSON (2 spaces) with a trailing newline. Key order of new entries: `selected, actionName, groupName, displayName, subGroupName`.
- Writes are plain `writeFileSync` (not atomic: no temp file plus rename). Accepted deliberately: the file is small, and Logi is not expected to write it at the same moment as an import.
- Logi Command Manager 2.2.0 (read from its bundled code, not documented) reads the file only on activation and on its Refresh button, keeps the entries in memory, and writes that whole copy back on its next edit. So after any write here the user must refresh in Logi, and the success messages say so. Without a refresh, an edit made in the Logi UI overwrites what this tool wrote (the timestamped backup holds the pre-write file only).

Catalog location (stable VS Code only): `<user-data>/Code/User/globalStorage/logi-sw.logiactions/logiActions.json`, where user-data is `~/Library/Application Support` (macOS), `%APPDATA%` (Windows, falling back to `~/AppData/Roaming`), `~/.config` (Linux). Insiders, VSCodium, Cursor, and portable installs are not handled. `package.json` sets `extensionKind: ["ui"]` so the file is written on the local machine in remote windows; this is untested. The obsolete `logitech-europe-sa.logiactions` id must not be used.

## 5. Command discovery

### 5.1 Terminology

The same two levels have three names depending on where you look.

| Where | Level 1 | Level 2 |
| --- | --- | --- |
| VS Code (Logi Command Manager UI, this importer, README) | Category | Subcategory |
| Options+ Actions Picker | Group | Subgroup |
| Catalog file `logiActions.json` and this code's setting keys | `groupName` | `subGroupName` |

Setting keys such as `groupNameOverrides` and `subGroupRules` keep the catalog vocabulary but set the category and subcategory. Logi UI facts (observed in the Logi Command Manager UI, not documented by Logitech): the "Add to plugin" dialog has a required "Command title" (empty by default, no inference) and a "Category" dropdown defaulting to "Saved Commands"; a category opens a flyout with "+ New Subcategory". There are exactly two levels, so catalog entries cannot express a third.

### 5.2 Sources and the three kinds of command

Two sources are merged (`discovery.ts`): manifests (`contributes.commands`, `contributes.views`, `contributes.viewsContainers`; exact owner and title) and the live registry (`vscode.commands.getCommands(true)`; ids only, no title, category, or owner). Every registry id falls into one of three kinds.

| Kind | Category | Subcategory | Name |
| --- | --- | --- | --- |
| Declared | Manifest `category` as written, else extension display name | None, unless a `subGroupRules` prefix matches (longest wins) | Manifest `title` as written |
| Generated | Owning extension's name (from the manifest declaring the view) | "Views" if all the extension's named views share one placement, else the placement name | "Focus on {view} View" or "Show {view} View" |
| Undeclared | "Saved Commands" | Derived from the id after the matched prefix, when possible | Inferred from the last id segment |

Command-less extensions (themes, keymaps) are omitted from the extension picker via `hasDeclaredCommands`, which checks for actual declared commands rather than self-reported `categories`. Consequence: an extension that declares views but no commands cannot be picked, and its generated commands appear only in the nothing-picked case or via a prefix.

**Declared.** The earlier design inferred a "namespace root" and turned dotted ids into subgroups. Real manifests showed this was inconsistent: it helped roughly one command in five and produced nonsense for others (command names used as subgroups, repeated words, lowercase ids that cannot be split into words). It was removed. Subcategory now comes only from the user's `subGroupRules`.

**Generated.** VS Code builds commands from each view an extension declares in `contributes.views`. Only two are offered per view: `<viewId>.focus` ("Focus on {view name} View") and `<viewId>.open` ("Show {view name} View"), and only if the id is in the live registry. Not offered: `.resetViewLocation`, `.removeView`, `.toggleVisibility` (menu or housekeeping), and the container commands `workbench.view.extension.<id>` (out of scope). Views with no name are skipped; two views with the same name yield identically named entries with distinct ids, left alone.

These commands do appear in at least some host UIs: in the VS Code build used for testing, `<viewId>.focus` is registered with the title "Focus on {name} View" and the container's title as its category, and is Command Palette listed; Logi Command Manager's own All Commands tab lists generated view commands (observed, e.g. `.focus`, `.open`, `.resetViewLocation`). An earlier version of this project claimed they never appear in the Palette and are absent from Logi's default catalog; both claims were wrong and were removed.

Placement is read from the declared location key of the view's container (Activity Bar, Panel, Secondary Sidebar). Built-in containers `explorer`, `scm`, `debug`, `test`, `remote`, `extensions` count as Activity Bar, matching VS Code's default. This is the default layout only: users can move views at runtime and that is not detected. If an extension's named views span more than one placement, the placement name is the subcategory; otherwise "Views". A view whose container cannot be resolved (unknown location key or a container no installed manifest declares) is ignored when comparing placements and gets "Views" when others span several.

Detection must be an exact match of the id against declared view ids, never a suffix check. A deliberately authored command such as `myExtension.terminal.open` merely ends in `.open`; a suffix test would misclassify it, while `mySidebar.focus` is generated only because `mySidebar` is a declared view id. Consequence (inferred from the design, not tested): a generated command for a view that no installed manifest declares, such as a built-in view, is not recognized as generated and falls to the undeclared path.

**Undeclared.** Ids that are neither declared nor generated: VS Code's own commands plus extensions' runtime-only commands. In one observed window (VS Code 1.144.1, 4,450 registry ids) the large majority of undeclared ids were VS Code core (`workbench.*`, `editor.*`, `notebook.*`), with a small remainder that looked like extensions' own runtime commands, a mix of real features and plumbing. Exact counts were not reproducible and are omitted.

A "sibling namespace" guess for the owner (match the first id segment against a declared command's root) was tried and removed: it credited core roots like `workbench` and `editor` to unrelated extensions. Undeclared commands are therefore included only when they match a configured `namespacePrefixes` entry.

## 6. Candidate selection, naming, grouping

**Inclusion** (`buildCandidates`): a command is a candidate if it matches any `namespacePrefixes` entry OR belongs to an extension picked in the first picker. Picked extensions contribute their declared and generated commands only. These are independent (OR), not a narrowing AND. If nothing is picked and no prefixes are configured, every declared and generated command from every installed extension is offered; undeclared commands are never offered without a prefix match. Candidates are sorted by command id.

**Name:** `displayNameOverrides[id]` if present. Else declared: the manifest `title` as written; generated: "Focus on/Show {view name} View"; undeclared: inferred from the last id segment (camelCase, hyphens, underscores split into title-cased words, acronyms kept), prefixed "Subcategory: " when a subcategory exists (e.g. "Terminal: New"). `displayNameFindReplace` then applies to derived names, never to an override.

**Duplicate titles:** Logi shows only the title, and about 29% of candidates in one real install (mostly GitLens, which registers one title per view) shared a category, subcategory and title with another. `buildCandidates` suffixes only those: " (<id segments left after trimming the prefix and suffix shared by the colliding ids, as lowercase space-separated words>)", e.g. "Hide Branch Pull Requests (branches)". At least one id segment is always kept; if two qualifiers still come out equal, the full command id is used. Unique titles stay exactly as written and an explicit `displayNameOverrides` entry is never changed. This slightly bends "title as written", deliberately.

**Category:** `groupNameOverrides[id]` if present. Else per kind (section 5.2). `groupNameFindReplace` applies to derived categories of declared and generated commands, not the fixed "Saved Commands", and never to an override.

**Subcategory:** `subGroupRules` (longest prefix) applies to declared commands. Generated commands use "Views" or the placement name. Undeclared commands: strip the longest matching configured prefix, drop the final id segment, title-case the remaining segments joined with spaces; nothing left means none. `workbench.action.terminal.new` with prefix `workbench.action.` gives "Terminal"; flat `workbench.action.closePanel` gives none. Quality depends on prefix length: a broad prefix like `workbench.` gives "Action Terminal".

`parseLineDelimitedPairs`: one `a|b` per line, split on the first `|` only, no trimming (so meaningful trailing spaces survive), blank and delimiter-less lines skipped individually. Chosen over a JSON-valued setting so one typo does not invalidate the whole setting. Limitation: find text cannot contain `|`.

## 7. Literal Quick Pick filter

VS Code's built-in Quick Pick filter is fuzzy subsequence matching, which is surprising on long lists of near-identical namespaced ids. The wrapper (`quickPick.ts`) replaces it with literal case-insensitive substring matching over label + description + detail (`buildSearchText`, `matchesLiteralQuery`; both PURE and unit tested).

How it works: `onDidChangeValue` recomputes `items` from the full list using the literal predicate, then restores `selectedItems`.

Requirements and pitfalls:

- `matchOnDescription = true` and `matchOnDetail = true` are required. `createQuickPick` still runs its own filter over whatever `items` are assigned, and by default checks only `label`. Without these flags, an item that correctly matched literally via description or detail only (a command id or group name containing the query, but not the display name) is silently hidden again by VS Code. Enabling them is safe because items are already narrowed to literal matches, and every literal substring match is also a valid fuzzy match.
- Checked state across re-filter: setting `items` clears the UI selection, so the wrapper keeps its own `checked` set of ids. On selection change it keeps checked ids that are currently not visible and replaces the visible ones with the new selection; after each re-filter it re-applies `selectedItems` for the visible checked ids. The result is accepted from `checked`, not from `selectedItems`.
- Unverified risk: assigning `items`/`selectedItems` inside `onDidChangeValue` may itself fire `onDidChangeSelection`. The selection handler keeps checks on items that are not visible, but if an event reported an empty selection before `selectedItems` was restored, it would drop the checks on visible items. The smoke test below is the way to confirm this does not happen. Manually checked in VS Code 1.144.1: after checking all filtered results and clearing the filter, exactly the previously filtered results were checked, as expected. The other smoke-test steps have not been recorded.
- Accepting with nothing checked returns an empty list; Escape returns undefined. The extension picker treats both as "no extension filter".

**This is the one piece not covered by unit tests**, because it needs a running VS Code host, and it is host-version dependent. A real bug lived here before the `matchOn*` flags were added.

Manual smoke test:
1. Run **Import Commands**; in the extension picker, check two or three extensions.
2. Type a filter that hides some of them; confirm the visible matches are correct and a match on command id only (not the label) still appears.
3. Check an item while filtered, then clear the filter completely.
4. Confirm every item checked at any point is still checked, including ones hidden at the time.
5. Accept and confirm the review picker and result reflect the checked set.

A port that uses the standard filter (or a different UI) can skip this section.

## 8. Testing approach

Unit tests are mocha + ts-node (`npm run test:unit`), PURE modules only, no VS Code host. Conventions:

- Catalog tests write to a fresh `fs.mkdtempSync` temp directory per test, never the real `globalStorage` path.
- Path resolution takes an explicit `{ platform, homedir, appData }`, so macOS/Windows/Linux resolution is tested on any host. Nothing reads `process.platform` or the environment inside the logic; only `flows/shared.ts` does.
- Manifests are passed as plain objects (`ExtensionManifestLike`), not real extensions.

Covered: declared, generated, and undeclared discovery; command-less extension detection; generated-command detection (exact id matching, including the suffix false-positive case above); view placement and the "Views"/placement subcategory; namespace and source-extension inclusion as an OR; already-cataloged exclusion; literal match and search-text building; literal find/replace (ordering of multiple rules, `find` treated as literal text, not a regex); `parseLineDelimitedPairs` edge cases; bulk catalog find/replace (only selected entries changed, no-ops not counted or written, backup only on change); find/replace on inferred names with overrides untouched; display-name inference; category and subcategory derivation (rule precedence, prefix stripping); config overrides; duplicate handling; catalog read/write/backup/merge; removal of arbitrary entries leaving others untouched; cross-platform path resolution.

Not covered: the Quick Pick wiring (section 7), command registration, and the real command registry.

## 9. What a port can drop or replace

- **`catalogPaths.ts` and `catalogIO.ts`:** if the Logi Command Manager extension already owns a storage layer, use it. Otherwise, use `context.globalStorageUri` rather than reconstructing the path from the OS; this also fixes Insiders/VSCodium/Cursor/portable support for free. Keep the backup-before-write and unique-`actionName` behaviors.
- **`importService.ts`:** its merge/remove/update logic is the part worth keeping; swap the `fs` calls for the host's store.
- **The three UI flows and the "open catalog" command:** the host extension likely has its own UI.
- **`quickPick.ts` / `literalFilter.ts`:** drop if the standard filter is acceptable.
- **Settings:** the `logiCommandImporter.*` namespace is this tool's own; map onto existing settings where possible (open question).
- **Keep:** `discovery.ts`, `candidates.ts`, `naming.ts`, `filtering.ts`, `findReplace.ts` as-is; they have no host dependencies.

## 10. Open questions for Logitech

1. **All Commands tab selection.** How does Logi decide which commands appear in its All Commands tab? In one observed case it listed an extension's three generated view commands but not its three declared context-menu commands or its four runtime commands. The answer determines whether this importer's candidate set should mirror it.
2. **Localization (unverified).** Are titles, categories, and view names in `extension.packageJSON` already localized at runtime? On disk they can be `%placeholder%` text resolved from `package.nls.json`. This has not been checked in a live host.
3. **Concurrent writes.** Does the Logi Command Manager extension or Options+ watch or rewrite `logiActions.json` while VS Code is running? This tool reads, modifies, and rewrites the whole file non-atomically; a concurrent write could be lost. Is there a preferred locking or atomic-replace convention?
4. **Schema stability.** Is the five-field entry schema stable and versioned? Are there fields or constraints not represented here (ordering, max lengths, allowed characters in `groupName`/`subGroupName`, behavior when `subGroupName` is `null` vs omitted)? Unknown fields on existing entries are preserved.
5. **`actionName` semantics.** Is case-sensitive uniqueness confirmed on Logi's side?
6. **Settings mapping.** Should these settings map to existing Logi Command Manager settings, or live under a new namespace?
7. **Multiple VS Code flavors.** Which user-data locations (Insiders, VSCodium, Cursor, portable) should the host extension support?
8. **Refreshing after an external write.** Logi's Refresh button is an internal webview message with no public command, and `logi.refreshSidebar` / `logi.refreshPanel` only re-send the in-memory list. Can Logi watch `logiActions.json`, or expose a command that re-reads it? This would also remove the overwrite risk described in section 4. A port into Logi's own extension would call its service directly and not need this.
9. **Atomic writes.** This importer writes `logiActions.json` with a plain `writeFileSync`, as Logi's own extension appears to, so an interruption mid-write could leave a truncated file. You know your storage layer better than we do: does it already write atomically (temp file plus rename), or would that be worth adding? If this logic is folded into your extension, we'd suggest it go through whatever write path you already trust. A pre-write backup is the only protection here today.
10. **Test framework.** Preferred framework and conventions for the host repo? These tests use mocha + ts-node with assertions on plain objects and could be ported mechanically.
