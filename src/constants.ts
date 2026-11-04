/** Settings section prefix; every setting is `logiCommandImporter.<key>` in package.json. */
export const CONFIG_SECTION = "logiCommandImporter";

/** Setting keys under CONFIG_SECTION. Must match `contributes.configuration` in package.json. */
export const SETTINGS = {
  namespacePrefixes: "namespacePrefixes",
  displayNameOverrides: "displayNameOverrides",
  groupNameOverrides: "groupNameOverrides",
  subGroupRules: "subGroupRules",
  sourceExtensionFilters: "sourceExtensionFilters",
  selectedByDefault: "selectedByDefault",
  displayNameFindReplace: "displayNameFindReplace",
  groupNameFindReplace: "groupNameFindReplace",
} as const;

/** Command ids. Must match `contributes.commands` in package.json exactly. */
export const COMMANDS = {
  importNamespacedCommands: "logiCommandImporter.importNamespacedCommands",
  removeImportedCommands: "logiCommandImporter.removeImportedCommands",
  findReplaceInCatalog: "logiCommandImporter.findReplaceInCatalog",
  openActiveCatalog: "logiCommandImporter.openActiveCatalog",
  openSettings: "logiCommandImporter.openSettings",
} as const;

/** Joins a category and its subcategory, e.g. "My Extension / Editing". */
export const CATEGORY_SEPARATOR = " / ";

/** Joins the source extension name and the category label in a Quick Pick detail line. */
export const DETAIL_SEPARATOR = " · ";
