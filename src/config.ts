import { DEFAULT_CONFIG, ImporterConfig } from "./types";

/**
 * Merges a partial config (e.g. from VS Code settings) over DEFAULT_CONFIG. Keys that are absent,
 * `undefined`, or `null` (e.g. a setting cleared to null in settings.json) fall back to the default; any other value (including empty arrays,
 * empty objects, and `false`) is kept as given.
 *
 * VS Code already fills in defaults declared in package.json, so in the extension this is mostly
 * a safety net — but it keeps the config logic pure and testable without a VS Code host.
 */
export function mergeConfig(partial: Partial<ImporterConfig> | undefined): ImporterConfig {
  const defined = Object.fromEntries(Object.entries(partial ?? {}).filter(([, value]) => value != null));
  return { ...DEFAULT_CONFIG, ...defined };
}
