import * as assert from "assert";
import { resolveCatalogPath, resolveObsoleteCatalogPath } from "../../catalogPaths";

describe("catalogPaths", () => {
  it("resolves the macOS path under Application Support", () => {
    const p = resolveCatalogPath({ platform: "darwin", homedir: "/Users/kris" });
    assert.strictEqual(
      p,
      "/Users/kris/Library/Application Support/Code/User/globalStorage/logi-sw.logiactions/logiActions.json"
    );
  });

  it("resolves the Windows path using APPDATA when provided", () => {
    const p = resolveCatalogPath({
      platform: "win32",
      homedir: "C:\\Users\\kris",
      appData: "C:\\Users\\kris\\AppData\\Roaming",
    });
    assert.strictEqual(
      p,
      "C:\\Users\\kris\\AppData\\Roaming\\Code\\User\\globalStorage\\logi-sw.logiactions\\logiActions.json"
    );
  });

  it("falls back to homedir-relative AppData on Windows when APPDATA is missing", () => {
    const p = resolveCatalogPath({ platform: "win32", homedir: "C:\\Users\\kris" });
    assert.strictEqual(
      p,
      "C:\\Users\\kris\\AppData\\Roaming\\Code\\User\\globalStorage\\logi-sw.logiactions\\logiActions.json"
    );
  });

  it("resolves the Linux path under ~/.config", () => {
    const p = resolveCatalogPath({ platform: "linux", homedir: "/home/kris" });
    assert.strictEqual(p, "/home/kris/.config/Code/User/globalStorage/logi-sw.logiactions/logiActions.json");
  });

  it("never resolves to the obsolete logitech-europe-sa.logiactions id", () => {
    const p = resolveCatalogPath({ platform: "darwin", homedir: "/Users/kris" });
    assert.ok(!p.includes("logitech-europe-sa.logiactions"));
  });

  it("can compute the obsolete path separately for migration-detection purposes", () => {
    const p = resolveObsoleteCatalogPath({ platform: "darwin", homedir: "/Users/kris" });
    assert.ok(p.includes("logitech-europe-sa.logiactions"));
  });
});
