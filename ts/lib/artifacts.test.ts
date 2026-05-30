import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readArtifact } from "./artifacts.js";

test("readArtifact supports project-relative plugin artifact paths", () => {
  const root = mkdtempSync(".tmp-artifact-root-");
  const cwd = process.cwd();

  try {
    const artifactPath = join(root, "custom-hook", "out", "Hook.sol");
    mkdirSync(artifactPath, { recursive: true });
    writeFileSync(
      join(artifactPath, "Hook.json"),
      JSON.stringify({ abi: [{ type: "function", name: "ok", inputs: [], outputs: [] }] }),
    );
    process.chdir(root);

    const artifact = readArtifact("custom-hook/out/Hook.sol/Hook.json");
    assert.equal(artifact.abi[0]?.type, "function");
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});
