import * as vscode from "vscode";
import * as os from "os";
import { buildCandidates } from "../candidates";
import { readCatalog } from "../catalogIO";
import { isSupportedPlatform, resolveCatalogPath } from "../catalogPaths";
import { mergeConfig } from "../config";
import { CONFIG_SECTION, SETTINGS } from "../constants";
import { discoverCommands, ExtensionManifestLike } from "../discovery";
import { parseLineDelimitedPairs } from "../findReplace";
import { CandidateEntry, CatalogEntry, ImporterConfig } from "../types";

/** Reads the extension's settings. Defaults declared in package.json are applied by VS Code. */
export function getConfig(): ImporterConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const pairs = (key: string) => parseLineDelimitedPairs(cfg.get<string>(key) ?? "");
  return mergeConfig({
    namespacePrefixes: cfg.get(SETTINGS.namespacePrefixes),
    displayNameOverrides: cfg.get(SETTINGS.displayNameOverrides),
    groupNameOverrides: cfg.get(SETTINGS.groupNameOverrides),
    subGroupRules: pairs(SETTINGS.subGroupRules),
    sourceExtensionFilters: cfg.get(SETTINGS.sourceExtensionFilters),
    selectedByDefault: cfg.get(SETTINGS.selectedByDefault),
    displayNameFindReplace: pairs(SETTINGS.displayNameFindReplace),
    groupNameFindReplace: pairs(SETTINGS.groupNameFindReplace),
  });
}

/** Path to the Logi Command Manager catalog file for the current OS. Throws if unsupported. */
export function getCatalogPath(): string {
  const platform = process.platform;
  if (!isSupportedPlatform(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return resolveCatalogPath({
    platform,
    homedir: os.homedir(),
    appData: process.env.APPDATA,
  });
}

/** Reads the catalog at the current OS's catalog path. */
export function readCurrentCatalog(): { catalogPath: string; catalog: CatalogEntry[] } {
  const catalogPath = getCatalogPath();
  return { catalogPath, catalog: readCatalog(catalogPath) };
}

/** Every installed extension, reduced to the shape the pure discovery code consumes. */
export function getInstalledExtensions(): ExtensionManifestLike[] {
  return vscode.extensions.all.map((e) => ({ id: e.id, packageJSON: e.packageJSON }));
}

/** Discovers import candidates from installed extensions' manifests plus the live command registry. */
export async function discoverCandidates(config: ImporterConfig): Promise<CandidateEntry[]> {
  const discovered = discoverCommands(getInstalledExtensions(), await vscode.commands.getCommands(true));
  return buildCandidates(discovered, config);
}
