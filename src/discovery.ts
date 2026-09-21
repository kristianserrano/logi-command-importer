import { DiscoveredCommand } from "./types";

export interface ManifestCommandContribution {
  command: string;
  title?: string;
  category?: string;
}

export interface ManifestViewContribution {
  id: string;
}

export interface ExtensionManifestLike {
  id: string;
  packageJSON: {
    displayName?: string;
    name?: string;
    contributes?: {
      commands?: ManifestCommandContribution[];
      views?: Record<string, ManifestViewContribution[]>;
      viewsContainers?: Record<string, ManifestViewContribution[]>;
    };
  };
}

interface SourceInfo {
  sourceExtensionId: string;
  sourceExtensionDisplayName: string;
}

function extensionDisplayName(ext: ExtensionManifestLike): string {
  return ext.packageJSON.displayName ?? ext.packageJSON.name ?? ext.id;
}

/**
 * True if the extension declares at least one command in `contributes.commands`. Used to filter
 * command-less extensions (themes, icon themes, keymaps, grammar/language-syntax-only extensions,
 * etc.) out of the "search by extension" picker — not by author-declared `categories` metadata
 * (self-reported, and only catches whichever categories are explicitly checked for), but by
 * whether there's actually anything to import. An extension with zero declared commands has
 * nothing to offer even if it declares views (the only other thing it could contribute is VS
 * Code's auto-generated per-view commands, which are always excluded anyway — see
 * isGeneratedViewOrContainerCommand).
 */
export function hasDeclaredCommands(ext: ExtensionManifestLike): boolean {
  return (ext.packageJSON.contributes?.commands?.length ?? 0) > 0;
}

/** Discovers commands declared in installed extensions' package.json `contributes.commands`. */
export function discoverManifestCommands(extensions: ExtensionManifestLike[]): DiscoveredCommand[] {
  const results: DiscoveredCommand[] = [];
  for (const ext of extensions) {
    const commands = ext.packageJSON.contributes?.commands ?? [];
    const displayName = extensionDisplayName(ext);
    for (const contribution of commands) {
      if (!contribution.command) {
        continue;
      }
      results.push({
        commandId: contribution.command,
        sourceExtensionId: ext.id,
        sourceExtensionDisplayName: displayName,
        title: contribution.title,
        category: contribution.category,
      });
    }
  }
  return results;
}

/**
 * For each source extension, infers its predominant namespace root from its own
 * manifest-declared commands — the single root shared by the most of them (e.g. "claude-vscode."
 * for an extension whose commands are mostly "claude-vscode.*" with a handful of "claude-code.*"
 * stragglers). Used to derive sensible default subgroups for extension-based search, without
 * requiring the user to type a namespace prefix by hand. A minority root's commands simply get no
 * default subgroup (same as any command whose id doesn't match a namespace prefix today) —
 * expected to be rare, and editable via `subGroupRules` or the Quick Pick review step when it
 * happens, rather than something worth a more elaborate multi-root scheme.
 */
export function inferPredominantNamespaceRoots(manifestCommands: DiscoveredCommand[]): Map<string, string> {
  const rootCountsByExtension = new Map<string, Map<string, number>>();
  for (const cmd of manifestCommands) {
    const root = namespaceRoot(cmd.commandId);
    if (!root) {
      continue;
    }
    const counts = rootCountsByExtension.get(cmd.sourceExtensionId) ?? new Map<string, number>();
    counts.set(root, (counts.get(root) ?? 0) + 1);
    rootCountsByExtension.set(cmd.sourceExtensionId, counts);
  }

  const predominantRootByExtension = new Map<string, string>();
  for (const [extensionId, counts] of rootCountsByExtension) {
    let bestRoot: string | null = null;
    let bestCount = 0;
    for (const [root, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        bestRoot = root;
      }
    }
    if (bestRoot) {
      predominantRootByExtension.set(extensionId, `${bestRoot}.`);
    }
  }
  return predominantRootByExtension;
}

export interface ViewOwnership {
  /** Declared view id -> the extension that declared it, e.g. "claudeVSCodeSidebar" -> Claude Code. */
  viewIdToSource: Map<string, SourceInfo>;
  /** Declared view container id -> the extension that declared it, e.g. "claude-sidebar" -> Claude Code. */
  containerIdToSource: Map<string, SourceInfo>;
}

/**
 * Builds a lookup of which extension declared each view and view container, from every installed
 * extension's `contributes.views` / `contributes.viewsContainers`. This is the authoritative,
 * exact source for attributing VS Code's auto-generated per-view/per-container commands (e.g.
 * "claudeVSCodeSidebar.focus", "workbench.view.extension.claude-sidebar") back to their owning
 * extension — those commands are never declared in `contributes.commands` (VS Code generates them
 * at runtime), so this is the only place that relationship is actually recorded.
 */
export function discoverViewOwnership(extensions: ExtensionManifestLike[]): ViewOwnership {
  const viewIdToSource = new Map<string, SourceInfo>();
  const containerIdToSource = new Map<string, SourceInfo>();

  for (const ext of extensions) {
    const source: SourceInfo = { sourceExtensionId: ext.id, sourceExtensionDisplayName: extensionDisplayName(ext) };

    const views = ext.packageJSON.contributes?.views ?? {};
    for (const location of Object.keys(views)) {
      for (const view of views[location] ?? []) {
        if (view.id) {
          viewIdToSource.set(view.id, source);
        }
      }
    }

    const containers = ext.packageJSON.contributes?.viewsContainers ?? {};
    for (const location of Object.keys(containers)) {
      for (const container of containers[location] ?? []) {
        if (container.id) {
          containerIdToSource.set(container.id, source);
        }
      }
    }
  }

  return { viewIdToSource, containerIdToSource };
}

const WORKBENCH_VIEW_EXTENSION_PREFIX = "workbench.view.extension.";
const RESET_VIEW_CONTAINER_LOCATION_SUFFIX = ".resetViewContainerLocation";

/**
 * Extracts the view container id from VS Code's auto-generated container commands
 * ("workbench.view.extension.<containerId>" to open it, or with the
 * ".resetViewContainerLocation" suffix), or null if commandId doesn't match that shape.
 */
function extractContainerId(commandId: string): string | null {
  if (!commandId.startsWith(WORKBENCH_VIEW_EXTENSION_PREFIX)) {
    return null;
  }
  const rest = commandId.slice(WORKBENCH_VIEW_EXTENSION_PREFIX.length);
  return rest.endsWith(RESET_VIEW_CONTAINER_LOCATION_SUFFIX)
    ? rest.slice(0, -RESET_VIEW_CONTAINER_LOCATION_SUFFIX.length)
    : rest;
}

/** The first dot-separated segment of a command id, used as a rough "namespace root" for attribution. */
function namespaceRoot(commandId: string): string | null {
  const dot = commandId.indexOf(".");
  return dot > 0 ? commandId.slice(0, dot) : null;
}

const GENERATED_VIEW_COMMAND_SUFFIXES = [".focus", ".open", ".resetViewLocation", ".removeView", ".toggleVisibility"];

/**
 * True if commandId is exactly one of VS Code's auto-generated per-view or per-container
 * commands — matched precisely against real declared view/container ids from `viewOwnership`,
 * not a suffix guess. This is deliberately stricter than checking "ends with .open" etc: a
 * command like "claude-vscode.terminal.open" also ends in ".open" but is a deliberate, titled
 * command, not generated boilerplate — it doesn't match here because "claude-vscode.terminal"
 * was never declared as a view id, only "claudeVSCodeSidebar" and similar were.
 */
export function isGeneratedViewOrContainerCommand(commandId: string, viewOwnership: ViewOwnership): boolean {
  const containerId = extractContainerId(commandId);
  if (containerId !== null && viewOwnership.containerIdToSource.has(containerId)) {
    return true;
  }
  for (const suffix of GENERATED_VIEW_COMMAND_SUFFIXES) {
    if (commandId.endsWith(suffix)) {
      const viewId = commandId.slice(0, -suffix.length);
      if (viewOwnership.viewIdToSource.has(viewId)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Merges command IDs from the live VS Code command registry with manifest-discovered commands.
 * Registry-only commands (not declared in any manifest — e.g. VS Code's own auto-generated
 * per-view/per-container commands, or commands registered dynamically at runtime) can't be
 * attributed directly, since the command registry API doesn't expose which extension owns a
 * given id. Resolution is attempted in order of confidence:
 *
 * 1. Exact view/container ownership (`viewOwnership`, from `contributes.views`/`viewsContainers`)
 *    — authoritative, since VS Code's per-view/per-container commands are always named after the
 *    declared view/container id.
 * 2. Sibling namespace root: a registry-only command sharing its namespace root with declared
 *    sibling commands (e.g. "claude-vscode.toggleDictation" alongside 31 declared
 *    "claude-vscode.*" commands) is attributed to the same source, unless that root is shared by
 *    more than one extension (ambiguous — never guessed at).
 * 3. Falls back to an "Other" source when neither resolves anything.
 */
export function mergeRegistryCommands(
  manifestCommands: DiscoveredCommand[],
  registryCommandIds: string[],
  viewOwnership: ViewOwnership = { viewIdToSource: new Map(), containerIdToSource: new Map() }
): DiscoveredCommand[] {
  const knownIds = new Set(manifestCommands.map((c) => c.commandId));

  const rootToSource = new Map<string, SourceInfo | null>();
  for (const cmd of manifestCommands) {
    const root = namespaceRoot(cmd.commandId);
    if (!root) {
      continue;
    }
    const existing = rootToSource.get(root);
    if (existing === undefined) {
      rootToSource.set(root, { sourceExtensionId: cmd.sourceExtensionId, sourceExtensionDisplayName: cmd.sourceExtensionDisplayName });
    } else if (existing && existing.sourceExtensionId !== cmd.sourceExtensionId) {
      rootToSource.set(root, null); // ambiguous — more than one extension under this root
    }
  }

  const merged = [...manifestCommands];
  for (const commandId of registryCommandIds) {
    if (!knownIds.has(commandId)) {
      const root = namespaceRoot(commandId);
      const viewOwner = root ? viewOwnership.viewIdToSource.get(root) : undefined;
      const containerId = extractContainerId(commandId);
      const containerOwner = containerId ? viewOwnership.containerIdToSource.get(containerId) : undefined;
      const siblingOwner = root ? rootToSource.get(root) : undefined;
      const inferred = viewOwner ?? containerOwner ?? siblingOwner ?? undefined;

      merged.push({
        commandId,
        sourceExtensionId: inferred?.sourceExtensionId ?? "unknown",
        sourceExtensionDisplayName: inferred?.sourceExtensionDisplayName ?? "Other",
        isGenerated: isGeneratedViewOrContainerCommand(commandId, viewOwnership),
      });
      knownIds.add(commandId);
    }
  }
  return merged;
}
