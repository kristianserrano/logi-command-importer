export interface CatalogEntry {
  selected: boolean;
  actionName: string;
  groupName: string;
  displayName: string;
  subGroupName: string | null;
}

export interface DiscoveredCommand {
  commandId: string;
  sourceExtensionId: string;
  sourceExtensionDisplayName: string;
  title?: string;
  category?: string;
  /**
   * True for VS Code's own auto-generated per-view/per-container commands (e.g.
   * "claudeVSCodeSidebar.focus", "workbench.view.extension.claude-sidebar") — identified by an
   * exact match against a declared view/container id, never a suffix guess. These are never
   * declared in any manifest and are always excluded from import candidates; there is no
   * override, since anyone who genuinely wants one can add it directly in Logi Options+.
   */
  isGenerated?: boolean;
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

export interface ImportOutcome {
  added: CatalogEntry[];
  skipped: { commandId: string; reason: string }[];
  duplicates: string[];
  failed: { commandId: string; reason: string }[];
}
