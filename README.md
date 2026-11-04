# Logi Command Importer

A VS Code extension that discovers commands registered by your installed extensions and imports the ones you select into the **Logi Command Manager** catalog used by Logi Options+. It has no built-in knowledge of any specific extension.

This is an unofficial companion tool, not affiliated with Logitech. Its Command Palette entries are prefixed "Logi Command Importer: ", distinct from Logitech's own "Logi Command Manager" extension, which owns the catalog this tool writes to.

For design rationale and porting notes, see [docs/DESIGN.md](docs/DESIGN.md).

## Requirements

- **VS Code** 1.85 or later (stable).
- The **Logi Command Manager** extension from Logitech, with Logi Options+, which owns the catalog this tool edits.

## Quick start

1. Run **Logi Command Importer: Import Commands** from the Command Palette.
2. Check the extensions you want, or none to see everything, and press Enter.
3. Check the commands to import and press Enter.
4. Click **Refresh** in Logi Command Manager. The commands appear under the categories shown in the picker.

## Commands

Available from the Command Palette (`Cmd/Ctrl+Shift+P`):

| Command | Description |
| --- | --- |
| **Logi Command Importer: Import Commands** | Runs the import flow and writes the selected commands to the catalog. |
| **Logi Command Importer: Remove Commands** | Pick any catalog entry to remove, whether or not this extension added it. |
| **Logi Command Importer: Find and Replace in Catalog** | One-off bulk cleanup of `displayName`/`groupName` text (the name and category) already in the catalog, with a preview before anything is written. |
| **Logi Command Importer: Open Active Logi Catalog** | Opens the resolved `logiActions.json` for the current platform. |
| **Logi Command Importer: Open Settings** | Opens Settings scoped to this extension. |

## Import flow

1. **Pick extensions (optional).** A multi-select Quick Pick titled "Import commands from which extensions? (optional)" lists installed extensions that declare at least one command. Every declared command and view-generated command of a checked extension becomes a candidate. Press Enter with none checked to skip. If nothing is checked and no `namespacePrefixes` are configured, every declared and generated command from every installed extension is offered.
2. **Review and select.** A second multi-select Quick Pick lists the candidates. Each item shows the name, the command id, and the source plus proposed category/subcategory. Commands already in the catalog (matched by `actionName`) are left out. Typing filters by literal, case-insensitive substring across all three fields, not VS Code's fuzzy matching.
3. **Confirm.** The extension reports how many entries were added, how many were skipped as duplicates, and the backup path if one was made. Logi Command Manager does not watch the catalog file, so click its **Refresh** button (or reload the window) to see the new commands. Do this before editing in the Logi UI, or its in-memory copy can overwrite the import.

`namespacePrefixes` are read from settings, not prompted for. There is no separate dry-run; the review step shows exactly what would be written.

## How commands are organized

Logi Command Manager has exactly two levels, Category and Subcategory (shown as Group and Subgroup in the Options+ Actions Picker). The importer fills them differently for three kinds of command.

| Kind | What it is | Category | Subcategory | Name |
| --- | --- | --- | --- | --- |
| Declared | Listed in an extension's `contributes.commands` | The manifest `category`, else the extension's display name | None, unless a `subGroupRules` prefix matches | The manifest `title`, as written |
| Generated | Created by VS Code for a view an extension declares. Only `<viewId>.focus` ("Focus on X View") and `<viewId>.open` ("Show X View"), and only if currently registered | The extension's name | "Views", or the placement name (Activity Bar, Panel, Secondary Sidebar) if the extension's views are in more than one | "Focus on X View" / "Show X View" |
| Undeclared | Registered but in no manifest: VS Code's own commands and extensions' runtime-only commands. Included only when the id matches a `namespacePrefixes` entry | "Saved Commands" | From the id after the matched prefix, when possible (see below) | Inferred from the last id segment, as "Subcategory: Name" when there is a subcategory |

Undeclared example with prefix `workbench.action.`: `workbench.action.terminal.new` becomes subcategory "Terminal", name "Terminal: New"; `workbench.action.closePanel` has no subcategory and is named "Close Panel". A shorter prefix such as `workbench.` gives poor subcategories ("Action Terminal"), so prefer the longest prefix that is still shared.

The registry exposes only ids, so undeclared commands have no title, category, or owner to read. That is why they need a prefix match and why the importer does not guess.

Two commands that would share a category, subcategory and title get a suffix taken from the part of the command id that differs (lowercase words, e.g. "open on dot dev"), e.g. "Hide Branch Pull Requests (branches)", so they can be told apart in Logi. Unique titles are never changed.

Overrides always win: `displayNameOverrides` and `groupNameOverrides` (the key says "group"; it sets the category) apply per command id. `displayNameFindReplace` applies to derived names and `groupNameFindReplace` to derived categories of declared and generated commands, never to explicit overrides or to the fixed "Saved Commands".

Only `.focus` and `.open` are generated; VS Code housekeeping ids such as `.resetViewLocation`, `.removeView`, `.toggleVisibility`, and `workbench.view.extension.<id>` are never offered as generated commands. They are registry ids with no manifest entry, so a `namespacePrefixes` match would import them as undeclared commands under "Saved Commands".

## Catalog location

The catalog is `logiActions.json` in the `logi-sw.logiactions` global storage folder of **stable VS Code** (the `Code` user-data folder):

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Code/User/globalStorage/logi-sw.logiactions/logiActions.json` |
| Windows | `%APPDATA%\Code\User\globalStorage\logi-sw.logiactions\logiActions.json` |
| Linux | `~/.config/Code/User/globalStorage/logi-sw.logiactions/logiActions.json` |

Only this location is supported. VS Code Insiders, VSCodium, Cursor, and portable installs use different user-data folders and are not supported.

Existing entries are never modified except by an explicit remove or find/replace. Duplicate `actionName` values are skipped, not overwritten. Every write first copies the existing file to `logiActions.backup-<ISO-timestamp>.json` in the same folder. Only the newest 10 backups are kept; older ones are deleted automatically, and nothing else in the folder is touched.

Example entry:

```json
{
  "selected": true,
  "actionName": "myExtension.doTheThing",
  "groupName": "My Extension",
  "displayName": "Do The Thing",
  "subGroupName": null
}
```

## Configuration

Settings live under `logiCommandImporter.*`.

| Setting | Type | Description | Example |
| --- | --- | --- | --- |
| `namespacePrefixes` | `string[]` | Also include commands whose id starts with any of these, including VS Code's own and runtime-only commands; they go under the "Saved Commands" category. Applied from settings; there is no prompt. | `["myExtension.", "workbench.action."]` |
| `displayNameOverrides` | `object` | Command id to explicit display name. | `{ "myExtension.doTheThing": "Do The Thing (Legacy)" }` |
| `groupNameOverrides` | `object` | Command id to explicit category name. | `{ "myExtension.doTheThing": "My Extension" }` |
| `subGroupRules` | `string` (one `prefix\|subGroupName` per line) | Command id prefix to subcategory. Longest match wins. Declared commands get no subcategory without a match. | `myExtension.insert\|Insert Commands` |
| `sourceExtensionFilters` | `string[]` | Extension ids pre-checked in the "Import commands from which extensions? (optional)" picker. What is checked at import time is what is used. | `["somePublisher.myExtension"]` |
| `selectedByDefault` | `boolean` | Whether new entries get `"selected": true`. Default `true`. | `true` |
| `displayNameFindReplace` | `string` (one `find\|replace` per line) | Literal find/replace applied to inferred display names on every import, in order. Never applied to a `displayNameOverrides` entry. | `MyExtension: \|` |
| `groupNameFindReplace` | `string` (one `find\|replace` per line) | Same, for derived category names. Never applied to a `groupNameOverrides` entry. | ` for VS Code\|` |

## Removal and find/replace

**Remove Commands** lists every catalog entry, including Logi's defaults and entries added elsewhere. Nothing is removed unless you select it, and a backup is taken first. Removal is matched by `actionName`.

**Find and Replace in Catalog** asks for a field (Display Name, Group Name, or Both; Group Name is the category), a literal find string (not a regex), and a replacement (blank removes the text). It previews every entry that would change, old value to new value, all pre-checked. Only checked entries are written. It never touches `actionName`.

## Building and testing

```bash
npm install
npm run compile     # type-check and build to dist/
npm run test:unit   # unit tests (mocha + ts-node)
npm run package     # produce a .vsix with @vscode/vsce
```

Unit tests never touch a real catalog; see [docs/DESIGN.md](docs/DESIGN.md) for the testing approach and the one area that needs a manual check.

## Limitations

- Stable VS Code only (see Catalog location). Windows, macOS, and Linux are supported.
- The extension is marked `extensionKind: ["ui"]` so it runs on your local machine, where the catalog lives, even in a remote window. Behavior in remote windows (commands from extensions running on the remote host) has not been tested.
- Generated view commands use the extension's default layout (Activity Bar, Panel, Secondary Sidebar). Views a user has moved are not detected.
- The extension picker lists only extensions that declare commands, so an extension with views but no declared commands can't be picked; its view commands appear only when nothing is picked or via a prefix.
- Views without a name are skipped. Two views with the same name produce identically named entries (distinct ids).
- Runtime-only commands (registered in code, absent from the manifest) are offered only when they match a `namespacePrefixes` entry. This tool does not activate other extensions, so such commands appear only after their extension has activated.
- Manifest titles and view names that are `%placeholder%` text on disk may or may not arrive localized at runtime. Unverified.
- Duplicate `actionName` values are skipped, never merged, even if the proposed names differ.
- Renaming an entry's `actionName` by hand makes it a different entry as far as removal is concerned.
- Removal has no origin restriction; removed entries can be re-added through this extension or in Logi Options+.
