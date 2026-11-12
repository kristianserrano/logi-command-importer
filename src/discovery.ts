import { DiscoveredCommand } from "./types";

/** A manifest string that may be a localization object (`{ value, original }`) instead of plain text. */
export type LocalizableText = string | { value?: string; original?: string };

export interface ManifestCommandContribution {
  command: string;
  title?: LocalizableText;
  category?: LocalizableText;
}

export interface ManifestViewContribution {
  id: string;
  name?: LocalizableText;
}

export interface ExtensionManifestLike {
  id: string;
  packageJSON: {
    displayName?: LocalizableText;
    name?: LocalizableText;
    contributes?: {
      commands?: ManifestCommandContribution[];
      /** Keyed by view container id (built-in like "explorer", or declared in some `viewsContainers`). */
      views?: Record<string, ManifestViewContribution[]>;
      /** Keyed by location ("activitybar", "panel", "secondarySidebar"). */
      viewsContainers?: Record<string, ManifestViewContribution[]>;
    };
  };
}

/** Sentinel source-extension id for undeclared commands, whose owner the registry doesn't expose. */
export const UNKNOWN_EXTENSION_ID = "unknown";

/** Source-extension display name shown for undeclared commands. */
export const UNDECLARED_EXTENSION_NAME = "Undeclared";

/** Subcategory for generated view commands unless an extension's views span several placements. */
export const VIEWS_SUBGROUP = "Views";

/** Display-name templates for the two generated view commands; `{view}` is the view's name. */
export const FOCUS_VIEW_TITLE_TEMPLATE = "Focus on {view} View";
export const OPEN_VIEW_TITLE_TEMPLATE = "Show {view} View";

/** The only generated per-view commands surfaced: id suffix -> title template. */
const GENERATED_VIEW_COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ["focus", FOCUS_VIEW_TITLE_TEMPLATE],
  ["open", OPEN_VIEW_TITLE_TEMPLATE],
];

/** `contributes.viewsContainers` location key -> placement name. */
const LOCATION_PLACEMENTS: Readonly<Record<string, string>> = {
  activitybar: "Activity Bar",
  panel: "Panel",
  secondarySidebar: "Secondary Sidebar",
};

/**
 * Built-in view container ids -> placement. This is VS Code's default and is not derivable from
 * any manifest, so it is hard-coded here.
 */
const BUILT_IN_CONTAINER_PLACEMENTS: Readonly<Record<string, string>> = {
  explorer: "Activity Bar",
  scm: "Activity Bar",
  debug: "Activity Bar",
  test: "Activity Bar",
  remote: "Activity Bar",
  extensions: "Activity Bar",
};

/** Resolves a plain-or-localized manifest string to trimmed text, or undefined when absent/empty. */
export function localizedText(text: LocalizableText | undefined): string | undefined {
  const raw = typeof text === "string" ? text : text?.value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function extensionDisplayName(ext: ExtensionManifestLike): string {
  return localizedText(ext.packageJSON.displayName) ?? localizedText(ext.packageJSON.name) ?? ext.id;
}

/**
 * True if the extension declares at least one command in `contributes.commands`. Used to filter
 * command-less extensions (themes, keymaps, grammars, etc.) out of the "search by extension"
 * picker by whether there's actually anything to import, not by self-reported `categories`.
 */
export function hasDeclaredCommands(ext: ExtensionManifestLike): boolean {
  return (ext.packageJSON.contributes?.commands?.length ?? 0) > 0;
}

function discoverDeclared(extensions: ExtensionManifestLike[]): DiscoveredCommand[] {
  const results: DiscoveredCommand[] = [];
  for (const ext of extensions) {
    const displayName = extensionDisplayName(ext);
    for (const contribution of ext.packageJSON.contributes?.commands ?? []) {
      if (!contribution.command) {
        continue;
      }
      results.push({
        commandId: contribution.command,
        sourceExtensionId: ext.id,
        sourceExtensionDisplayName: displayName,
        kind: "declared",
        title: localizedText(contribution.title),
        category: localizedText(contribution.category),
      });
    }
  }
  return results;
}

/** Container id -> location key, from every installed extension's `contributes.viewsContainers`. */
function collectContainerLocations(extensions: ExtensionManifestLike[]): Map<string, string> {
  const locations = new Map<string, string>();
  for (const ext of extensions) {
    const containers = ext.packageJSON.contributes?.viewsContainers ?? {};
    for (const [location, list] of Object.entries(containers)) {
      for (const container of list ?? []) {
        if (container.id && !locations.has(container.id)) {
          locations.set(container.id, location);
        }
      }
    }
  }
  return locations;
}

/** Placement name for a view's container, or undefined when it can't be resolved. */
function resolvePlacement(containerId: string, containerLocations: Map<string, string>): string | undefined {
  const location = containerLocations.get(containerId);
  return location !== undefined ? LOCATION_PLACEMENTS[location] : BUILT_IN_CONTAINER_PLACEMENTS[containerId];
}

/**
 * Builds the `<viewId>.focus` / `<viewId>.open` commands VS Code generates for each named view an
 * extension declares — only when that id is actually in the live registry. The subcategory is
 * "Views" unless the extension's views sit in more than one placement, in which case each view's
 * own placement is used so they stay separated.
 */
function discoverGenerated(
  extensions: ExtensionManifestLike[],
  registryIds: Set<string>,
  containerLocations: Map<string, string>
): DiscoveredCommand[] {
  const results: DiscoveredCommand[] = [];
  for (const ext of extensions) {
    const views: Array<{ id: string; name: string; placement?: string }> = [];
    for (const [containerId, list] of Object.entries(ext.packageJSON.contributes?.views ?? {})) {
      const placement = resolvePlacement(containerId, containerLocations);
      for (const view of list ?? []) {
        const name = localizedText(view.name);
        if (view.id && name) {
          views.push({ id: view.id, name, placement });
        }
      }
    }

    const distinctPlacements = new Set(views.flatMap((v) => (v.placement ? [v.placement] : [])));
    const displayName = extensionDisplayName(ext);
    for (const view of views) {
      const defaultSubGroupName = distinctPlacements.size > 1 ? view.placement ?? VIEWS_SUBGROUP : VIEWS_SUBGROUP;
      for (const [suffix, template] of GENERATED_VIEW_COMMANDS) {
        const commandId = `${view.id}.${suffix}`;
        if (registryIds.has(commandId)) {
          results.push({
            commandId,
            sourceExtensionId: ext.id,
            sourceExtensionDisplayName: displayName,
            kind: "generated",
            title: template.replace("{view}", view.name),
            defaultSubGroupName,
          });
        }
      }
    }
  }
  return results;
}

/**
 * Discovers every command and classifies it (see CommandKind): declared commands from manifests,
 * generated per-view commands (only those present in the registry), and every remaining registry
 * id as undeclared. An id is reported once; declared wins over generated wins over undeclared.
 */
function addDiscoveredCommand(results: Map<string, DiscoveredCommand>, cmd: DiscoveredCommand): void {
  if (!results.has(cmd.commandId)) {
    results.set(cmd.commandId, cmd);
  }
}

export function discoverCommands(extensions: ExtensionManifestLike[], registryCommandIds: string[]): DiscoveredCommand[] {
  const registryIds = new Set(registryCommandIds);
  const declared = discoverDeclared(extensions);
  const generated = discoverGenerated(extensions, registryIds, collectContainerLocations(extensions));
  const results = new Map<string, DiscoveredCommand>();

  for (const cmd of [...declared, ...generated]) {
    addDiscoveredCommand(results, cmd);
  }

  for (const commandId of registryIds) {
    if (!results.has(commandId)) {
      addDiscoveredCommand(results, {
        commandId,
        sourceExtensionId: UNKNOWN_EXTENSION_ID,
        sourceExtensionDisplayName: UNDECLARED_EXTENSION_NAME,
        kind: "undeclared",
      });
    }
  }

  return [...results.values()];
}
