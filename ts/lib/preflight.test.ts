import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { validateXLayerPreflight, validateXLayerReadinessPreflight } from "./preflight.js";

const validEnv: NodeJS.ProcessEnv = {
  DEPLOYMENT_NETWORK: "xlayer",
  XLAYER_RPC_URL: "https://rpc.xlayer.example",
  PRIVATE_KEY: `0x${"1".repeat(64)}`,
  GIT_COMMIT: "abc123",
  DEPLOYED_AT: "2026-05-12T00:00:00.000Z",
  TEAM_MULTISIG: "0x0000000000000000000000000000000000000001",
  UNISWAP_V4_POOL_MANAGER: "0x0000000000000000000000000000000000000002",
  UNISWAP_V4_POSITION_MANAGER: "0x0000000000000000000000000000000000000003",
  LP_RECIPIENT: "0x0000000000000000000000000000000000000001",
  MIGRATION_TARGET: "0x0000000000000000000000000000000000000004",
  XLAYER_V4_HOOKS: "0x0000000000000000000000000000000000000000",
  XLAYER_V4_POOL_FEE: "3000",
  XLAYER_V4_TICK_SPACING: "60",
  XLAYER_V4_TICK_LOWER: "-887220",
  XLAYER_V4_TICK_UPPER: "887220",
  XLAYER_V4_MIGRATION_LIQUIDITY: "1000000000000000000",
};

test("validateXLayerPreflight accepts complete production env", () => {
  assert.deepEqual(validateXLayerPreflight(validEnv), { ok: true, errors: [], warnings: [] });
});

test("validateXLayerReadinessPreflight accepts read-only gate env without deploy secrets", () => {
  const {
    PRIVATE_KEY,
    GIT_COMMIT,
    DEPLOYED_AT,
    ...readinessEnv
  } = validEnv;

  assert.equal(PRIVATE_KEY, validEnv.PRIVATE_KEY);
  assert.equal(GIT_COMMIT, validEnv.GIT_COMMIT);
  assert.equal(DEPLOYED_AT, validEnv.DEPLOYED_AT);
  assert.deepEqual(validateXLayerReadinessPreflight(readinessEnv), { ok: true, errors: [], warnings: [] });
});

test("validateXLayerReadinessPreflight accepts generic RPC_URL fallback", () => {
  const {
    XLAYER_RPC_URL,
    ...readinessEnv
  } = validEnv;

  assert.equal(XLAYER_RPC_URL, validEnv.XLAYER_RPC_URL);
  assert.deepEqual(validateXLayerReadinessPreflight({
    ...readinessEnv,
    RPC_URL: "https://rpc.generic.example",
  }), { ok: true, errors: [], warnings: [] });
});

test("validateXLayerPreflight accepts generic RPC_URL fallback", () => {
  const {
    XLAYER_RPC_URL,
    ...env
  } = validEnv;

  assert.equal(XLAYER_RPC_URL, validEnv.XLAYER_RPC_URL);
  assert.deepEqual(validateXLayerPreflight({
    ...env,
    RPC_URL: "https://rpc.generic.example",
  }), { ok: true, errors: [], warnings: [] });
});

test("validateXLayerReadinessPreflight rejects non-XLayer chain id overrides", () => {
  const result = validateXLayerReadinessPreflight({
    ...validEnv,
    XLAYER_CHAIN_ID: "31337",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["XLAYER_CHAIN_ID must be 196 when set"]);
});

test("validateXLayerReadinessPreflight requires explicit migration pool env", () => {
  const {
    XLAYER_V4_HOOKS,
    XLAYER_V4_POOL_FEE,
    XLAYER_V4_TICK_SPACING,
    XLAYER_V4_TICK_LOWER,
    XLAYER_V4_TICK_UPPER,
    XLAYER_V4_MIGRATION_LIQUIDITY,
    ...env
  } = validEnv;

  assert.equal(XLAYER_V4_HOOKS, validEnv.XLAYER_V4_HOOKS);
  assert.equal(XLAYER_V4_POOL_FEE, validEnv.XLAYER_V4_POOL_FEE);
  assert.equal(XLAYER_V4_TICK_SPACING, validEnv.XLAYER_V4_TICK_SPACING);
  assert.equal(XLAYER_V4_TICK_LOWER, validEnv.XLAYER_V4_TICK_LOWER);
  assert.equal(XLAYER_V4_TICK_UPPER, validEnv.XLAYER_V4_TICK_UPPER);
  assert.equal(XLAYER_V4_MIGRATION_LIQUIDITY, validEnv.XLAYER_V4_MIGRATION_LIQUIDITY);

  const result = validateXLayerReadinessPreflight(env);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "XLAYER_V4_HOOKS is required",
    "XLAYER_V4_POOL_FEE is required",
    "XLAYER_V4_TICK_SPACING is required",
    "XLAYER_V4_TICK_LOWER is required",
    "XLAYER_V4_TICK_UPPER is required",
    "XLAYER_V4_MIGRATION_LIQUIDITY is required",
  ]);
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
      DEPLOYMENT_NETWORK: "xlayer",
      DEPLOYED_AT: "",
      GIT_COMMIT: "",
      LP_RECIPIENT: "",
      MIGRATION_TARGET: "",
      NODE_OPTIONS: "--no-warnings",
      PRIVATE_KEY: "bad",
      TEAM_MULTISIG: "",
      UNISWAP_V4_POOL_MANAGER: "",
      UNISWAP_V4_POSITION_MANAGER: "",
      XLAYER_V4_HOOKS: "",
      XLAYER_V4_POOL_FEE: "",
      XLAYER_V4_TICK_SPACING: "",
      XLAYER_V4_TICK_LOWER: "",
      XLAYER_V4_TICK_UPPER: "",
      XLAYER_V4_MIGRATION_LIQUIDITY: "",
      XLAYER_RPC_URL: "",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.deepEqual(output.errors, [
    "XLAYER_RPC_URL is required",
    "PRIVATE_KEY must be a 32-byte hex string",
    "GIT_COMMIT is required",
    "DEPLOYED_AT is required",
    "TEAM_MULTISIG is required",
    "UNISWAP_V4_POOL_MANAGER is required",
    "UNISWAP_V4_POSITION_MANAGER is required",
    "LP_RECIPIENT is required",
    "MIGRATION_TARGET is required",
    "XLAYER_V4_HOOKS is required",
    "XLAYER_V4_POOL_FEE is required",
    "XLAYER_V4_TICK_SPACING is required",
    "XLAYER_V4_TICK_LOWER is required",
    "XLAYER_V4_TICK_UPPER is required",
    "XLAYER_V4_MIGRATION_LIQUIDITY is required",
  ]);
});

test("preflight-xlayer-readiness CLI does not require PRIVATE_KEY or deployment provenance", () => {
  const result = spawnSync(process.execPath, [
    "--import",
    "tsx",
    "ts/cli/preflight-xlayer-readiness.ts",
  ], {
    env: {
      ...process.env,
      DEPLOYMENT_NETWORK: "xlayer",
      LP_RECIPIENT: validEnv.LP_RECIPIENT,
      MIGRATION_TARGET: validEnv.MIGRATION_TARGET,
      NODE_OPTIONS: "--no-warnings",
      TEAM_MULTISIG: validEnv.TEAM_MULTISIG,
      UNISWAP_V4_POOL_MANAGER: validEnv.UNISWAP_V4_POOL_MANAGER,
      UNISWAP_V4_POSITION_MANAGER: validEnv.UNISWAP_V4_POSITION_MANAGER,
      XLAYER_V4_HOOKS: validEnv.XLAYER_V4_HOOKS,
      XLAYER_V4_POOL_FEE: validEnv.XLAYER_V4_POOL_FEE,
      XLAYER_V4_TICK_SPACING: validEnv.XLAYER_V4_TICK_SPACING,
      XLAYER_V4_TICK_LOWER: validEnv.XLAYER_V4_TICK_LOWER,
      XLAYER_V4_TICK_UPPER: validEnv.XLAYER_V4_TICK_UPPER,
      XLAYER_V4_MIGRATION_LIQUIDITY: validEnv.XLAYER_V4_MIGRATION_LIQUIDITY,
      XLAYER_RPC_URL: validEnv.XLAYER_RPC_URL,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, errors: [], warnings: [] });
});
