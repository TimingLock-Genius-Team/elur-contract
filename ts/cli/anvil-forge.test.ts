import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(root, "ts/cli/anvil-forge.ts");

test("anvil-forge prints usage without subcommand", () => {
  const res = spawnSync("npx", ["tsx", cli], { encoding: "utf8", cwd: root });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Usage:/);
});

test("anvil-forge deploy-factory fails fast without PRIVATE_KEY", () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k !== "PRIVATE_KEY"),
  ) as NodeJS.ProcessEnv;
  const res = spawnSync("npx", ["tsx", cli, "deploy-factory"], { encoding: "utf8", cwd: root, env });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /PRIVATE_KEY/);
});

test("anvil-forge create-and-mint fails without FACTORY", () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k !== "FACTORY"),
  ) as NodeJS.ProcessEnv;
  env.PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const res = spawnSync("npx", ["tsx", cli, "create-and-mint"], { encoding: "utf8", cwd: root, env });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /FACTORY/);
});
