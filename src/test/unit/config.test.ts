import * as assert from "assert";
import { mergeConfig } from "../../config";
import { DEFAULT_CONFIG } from "../../types";

describe("mergeConfig", () => {
  it("returns the defaults for undefined or empty input", () => {
    assert.deepStrictEqual(mergeConfig(undefined), DEFAULT_CONFIG);
    assert.deepStrictEqual(mergeConfig({}), DEFAULT_CONFIG);
  });

  it("overrides only the provided keys", () => {
    const merged = mergeConfig({ namespacePrefixes: ["a."], selectedByDefault: false });
    assert.deepStrictEqual(merged, { ...DEFAULT_CONFIG, namespacePrefixes: ["a."], selectedByDefault: false });
  });

  it("treats explicitly undefined values as absent", () => {
    assert.deepStrictEqual(mergeConfig({ namespacePrefixes: undefined, selectedByDefault: undefined }), DEFAULT_CONFIG);
  });

  it("treats null values (e.g. a setting set to null in settings.json) as absent", () => {
    const merged = mergeConfig({ namespacePrefixes: null as unknown as string[] });
    assert.deepStrictEqual(merged.namespacePrefixes, DEFAULT_CONFIG.namespacePrefixes);
  });

  it("keeps falsy-but-defined values such as false and empty collections", () => {
    const merged = mergeConfig({ selectedByDefault: false, sourceExtensionFilters: [], subGroupRules: {} });
    assert.strictEqual(merged.selectedByDefault, false);
    assert.deepStrictEqual(merged.sourceExtensionFilters, []);
    assert.deepStrictEqual(merged.subGroupRules, {});
  });
});
