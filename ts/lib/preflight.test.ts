import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { validateXLayerPreflight } from "./preflight.js";

const validEnv: NodeJS.ProcessEnv = {
  DEPLOYMENT_NETWORK: "xlayer",
  XLAYER_RPC_URL: "https://rpc.xlayer.example",
  PRIVATE_KEY: `0x${"1".repeat(64)}`,
  GIT_COMMIT: "abc123",
  DEPLOYED_AT: "2026-05-12T00:00:00.000Z",
  TEAM_MULTISIG: "0x0000000000000000000000000000000000000001",
  UNISWAP_V4_POOL_MANAGER: "0x0000000000000000000000000000000000000002",
  UNISWAP_V4_POSITION_MANAGER: "0x0000000000000000000000000000000000000003",
  LP_RECIPIENT: "0x000000000000000000000000000000000000dEaD",
  MIGRATION_TARGET: "0x0000000000000000000000000000000000000004",
};

test("validateXLayerPreflight accepts complete production env", () => {
  assert.deepEqual(validateXLayerPreflight(validEnv), { ok: true, errors: [], warnings: [] });
});

test("validateXLayerPreflight reports missing env and malformed values", () => {
  const result = validateXLayerPreflight({
    ...validEnv,
    DEPLOYMENT_NETWORK: "anvil",
    XLAYER_RPC_URL: "",
    PRIVATE_KEY: "not-a-key",
    DEPLOYED_AT: "not-a-date",
    TEAM_MULTISIG: "not-an-address",
    MIGRATION_TARGET: "",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "DEPLOYMENT_NETWORK must be xlayer",
    "XLAYER_RPC_URL is required",
    "PRIVATE_KEY must be a 32-byte hex string",
    "DEPLOYED_AT must be a valid timestamp",
    "TEAM_MULTISIG must be a valid address",
    "MIGRATION_TARGET is required",
  ]);
});

test("preflight-xlayer CLI emits JSON and exits non-zero on invalid env", () => {
  const result = spawnSync(process.execPath, [
    "--import",
    "tsx",
    "ts/cli/preflight-xlayer.ts",
  ], {
    env: {
      ...process.env,
      DEPLOYMENT_NETWORK: "xlayer",
      NODE_OPTIONS: "--no-warnings",
      PRIVATE_KEY: "bad",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.match(output.errors.join("\n"), /PRIVATE_KEY must be a 32-byte hex string/);
  assert.match(output.errors.join("\n"), /XLAYER_RPC_URL is required/);
});
