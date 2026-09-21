import { DEFAULT_CONFIG, ImporterConfig } from "./types";

/** Merges a partial config (e.g. from VS Code settings) over the defaults. */
export function mergeConfig(partial: Partial<ImporterConfig> | undefined): ImporterConfig {
  return {
    namespacePrefixes: partial?.namespacePrefixes ?? DEFAULT_CONFIG.namespacePrefixes,
    displayNameOverrides: partial?.displayNameOverrides ?? DEFAULT_CONFIG.displayNameOverrides,
    groupNameOverrides: partial?.groupNameOverrides ?? DEFAULT_CONFIG.groupNameOverrides,
    subGroupRules: partial?.subGroupRules ?? DEFAULT_CONFIG.subGroupRules,
    sourceExtensionFilters: partial?.sourceExtensionFilters ?? DEFAULT_CONFIG.sourceExtensionFilters,
    selectedByDefault: partial?.selectedByDefault ?? DEFAULT_CONFIG.selectedByDefault,
    displayNameFindReplace: partial?.displayNameFindReplace ?? DEFAULT_CONFIG.displayNameFindReplace,
    groupNameFindReplace: partial?.groupNameFindReplace ?? DEFAULT_CONFIG.groupNameFindReplace,
  };
}
