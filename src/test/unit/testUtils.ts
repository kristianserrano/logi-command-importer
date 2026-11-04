import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Returns a catalog file path inside a fresh temp directory (the file itself is not created). */
export function tempCatalogPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logi-catalog-test-"));
  return path.join(dir, "logiActions.json");
}
