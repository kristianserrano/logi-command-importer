export interface CatalogEntry {
  selected: boolean;
  actionName: string;
  groupName: string;
  displayName: string;
  subGroupName: string | null;
}

/**
 * How a command relates to extension manifests:
 * - "declared": listed in an extension's `contributes.commands`.
 * - "generated": built by VS Code for a view an extension declares in `contributes.views`
 *   (only the `.focus` / `.open` commands are surfaced).
 * - "undeclared": present in the live registry but in no manifest (VS Code's own commands and
 *   extensions' runtime-only commands). The registry gives no owner, so these have none.
 */
export type CommandKind = "declared" | "generated" | "undeclared";

export interface DiscoveredCommand {
  commandId: string;
  sourceExtensionId: string;
  sourceExtensionDisplayName: string;
  kind: CommandKind;
  /** Manifest `title` (declared) or the title template result (generated), localization already resolved. */
  title?: string;
  /** Manifest `category` as written (declared only), localization already resolved. */
  category?: string;
  /** Default Subcategory for generated view commands (see discovery.ts); a `subGroupRules` match still overrides it. */
  defaultSubGroupName?: string;
}

export interface CandidateEntry {
  commandId: string;
  sourceExtensionId: string;
  sourceExtensionDisplayName: string;
  displayName: string;
  groupName: string;
  subGroupName: string | null;
}

export interface ImporterConfig {
  namespacePrefixes: string[];
  displayNameOverrides: Record<string, string>;
  groupNameOverrides: Record<string, string>;
  /** prefix -> subgroup name. The longest matching prefix wins. */
  subGroupRules: Record<string, string>;
  sourceExtensionFilters: string[];
  selectedByDefault: boolean;
  /** find -> replace, applied to inferred display names on every import — never to an explicit displayNameOverrides entry. */
  displayNameFindReplace: Record<string, string>;
  /** find -> replace, applied to derived group names on every import — never to an explicit groupNameOverrides entry. */
  groupNameFindReplace: Record<string, string>;
}

export const DEFAULT_CONFIG: ImporterConfig = {
  namespacePrefixes: [],
  displayNameOverrides: {},
  groupNameOverrides: {},
  subGroupRules: {},
  sourceExtensionFilters: [],
  selectedByDefault: true,
  displayNameFindReplace: {},
  groupNameFindReplace: {},
};

export type SupportedPlatform = "darwin" | "win32" | "linux";
