import * as vscode from "vscode";
import { COMMANDS } from "./constants";
import { runFindReplaceFlow } from "./flows/findReplaceFlow";
import { runImportFlow } from "./flows/importFlow";
import { runOpenCatalog, runOpenSettings } from "./flows/openFlows";
import { runRemoveFlow } from "./flows/removeFlow";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.importNamespacedCommands, runImportFlow),
    vscode.commands.registerCommand(COMMANDS.removeImportedCommands, runRemoveFlow),
    vscode.commands.registerCommand(COMMANDS.findReplaceInCatalog, runFindReplaceFlow),
    vscode.commands.registerCommand(COMMANDS.openActiveCatalog, runOpenCatalog),
    vscode.commands.registerCommand(COMMANDS.openSettings, runOpenSettings)
  );
}

export function deactivate(): void {
  // no-op
}
