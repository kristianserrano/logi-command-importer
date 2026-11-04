import * as vscode from "vscode";
import { CONFIG_SECTION } from "../constants";
import { getCatalogPath } from "./shared";

export async function runOpenCatalog(): Promise<void> {
  const catalogPath = getCatalogPath();
  const uri = vscode.Uri.file(catalogPath);
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch {
    vscode.window.showWarningMessage(`No Logi catalog file found yet at: ${catalogPath}`);
  }
}

export async function runOpenSettings(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openSettings", CONFIG_SECTION);
}
