import * as path from "path";
import { SupportedPlatform } from "./types";

/** Current Logi Command Manager global storage id. Never use the obsolete logitech-europe-sa.logiactions id. */
export const LOGI_CATALOG_EXTENSION_ID = "logi-sw.logiactions";
export const OBSOLETE_LOGI_CATALOG_EXTENSION_ID = "logitech-europe-sa.logiactions";
const CATALOG_FILE_NAME = "logiActions.json";

export interface PathResolutionEnv {
  platform: SupportedPlatform;
  homedir: string;
  /** Value of %APPDATA% on Windows; ignored on other platforms. */
  appData?: string;
}

/**
 * Resolves the active Logi Command Manager catalog path for VS Code (stable build) on the given platform.
 */
export function resolveCatalogPath(env: PathResolutionEnv): string {
  switch (env.platform) {
    case "darwin":
      return path.posix.join(
        env.homedir,
        "Library",
        "Application Support",
        "Code",
        "User",
        "globalStorage",
        LOGI_CATALOG_EXTENSION_ID,
        CATALOG_FILE_NAME
      );
    case "win32": {
      const appData = env.appData ?? path.win32.join(env.homedir, "AppData", "Roaming");
      return path.win32.join(appData, "Code", "User", "globalStorage", LOGI_CATALOG_EXTENSION_ID, CATALOG_FILE_NAME);
    }
    case "linux":
      return path.posix.join(
        env.homedir,
        ".config",
        "Code",
        "User",
        "globalStorage",
        LOGI_CATALOG_EXTENSION_ID,
        CATALOG_FILE_NAME
      );
    default: {
      const exhaustive: never = env.platform;
      throw new Error(`Unsupported platform: ${String(exhaustive)}`);
    }
  }
}

export function resolveObsoleteCatalogPath(env: PathResolutionEnv): string {
  return resolveCatalogPath(env).replace(LOGI_CATALOG_EXTENSION_ID, OBSOLETE_LOGI_CATALOG_EXTENSION_ID);
}

export function isSupportedPlatform(platform: string): platform is SupportedPlatform {
  return platform === "darwin" || platform === "win32" || platform === "linux";
}
