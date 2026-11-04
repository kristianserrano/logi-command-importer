import * as path from "path";
import { SupportedPlatform } from "./types";

/** Current Logi Command Manager global storage id. Never use the obsolete logitech-europe-sa.logiactions id. */
export const LOGI_CATALOG_EXTENSION_ID = "logi-sw.logiactions";
const CATALOG_FILE_NAME = "logiActions.json";

export interface PathResolutionEnv {
  platform: SupportedPlatform;
  homedir: string;
  /** Value of %APPDATA% on Windows; ignored on other platforms. */
  appData?: string;
}

const VSCODE_DIR = "Code";
const USER_DIR = "User";
const GLOBAL_STORAGE_DIR = "globalStorage";

/**
 * Resolves the active Logi Command Manager catalog path for VS Code (stable build) on the given platform.
 * Only the per-platform base directory differs; the Code/User/globalStorage/<id>/<file> tail is shared.
 */
export function resolveCatalogPath(env: PathResolutionEnv): string {
  let pathApi: typeof path.posix;
  let baseDir: string;
  switch (env.platform) {
    case "darwin":
      pathApi = path.posix;
      baseDir = path.posix.join(env.homedir, "Library", "Application Support");
      break;
    case "win32":
      pathApi = path.win32;
      baseDir = env.appData ?? path.win32.join(env.homedir, "AppData", "Roaming");
      break;
    case "linux":
      pathApi = path.posix;
      baseDir = path.posix.join(env.homedir, ".config");
      break;
    default: {
      const exhaustive: never = env.platform;
      throw new Error(`Unsupported platform: ${String(exhaustive)}`);
    }
  }
  return pathApi.join(baseDir, VSCODE_DIR, USER_DIR, GLOBAL_STORAGE_DIR, LOGI_CATALOG_EXTENSION_ID, CATALOG_FILE_NAME);
}

/** Type guard: true if `platform` is one of the OS identifiers this extension supports. */
export function isSupportedPlatform(platform: string): platform is SupportedPlatform {
  return platform === "darwin" || platform === "win32" || platform === "linux";
}
