import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { COMMANDS, CONFIG_SECTION, SETTINGS } from "../../constants";

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../package.json"), "utf8"));

describe("constants match package.json", () => {
  it("COMMANDS are exactly the contributed commands", () => {
    const contributed = pkg.contributes.commands.map((c: { command: string }) => c.command).sort();
    assert.deepStrictEqual(Object.values(COMMANDS).sort(), contributed);
  });

  it("SETTINGS are exactly the contributed settings", () => {
    const contributed = Object.keys(pkg.contributes.configuration.properties).sort();
    assert.deepStrictEqual(Object.values(SETTINGS).map((k) => `${CONFIG_SECTION}.${k}`).sort(), contributed);
  });
});
