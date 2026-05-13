import { strict as assert } from "node:assert";
import test from "node:test";
import type { Deployment } from "../config/deployments.js";
import type { MigrationTargetDeploymentRecord } from "../config/migration-target-deployments.js";
import { defaultCurveParams } from "../config/params.js";
import { doctorXLayerReadinessConsistency } from "./xlayer-readiness-consistency.js";

const deployment: Deployment = {
  chainId: 196,
  commit: "abc123",
  deployedAt: "2026-05-12T00:00:00.000Z",
  deployer: "0x0000000000000000000000000000000000000001",
  factory: "0x0000000000000000000000000000000000000002",
  feeRecipient: "0x0000000000000000000000000000000000000003",
  uniswapV4PoolManager: "0x0000000000000000000000000000000000000004",
  uniswapV4PositionManager: "0x0000000000000000000000000000000000000005",
  migrationTarget: "0x0000000000000000000000000000000000000006",
  curve: defaultCurveParams,
  createdTokens: [],
};

const migrationTargetDeployment: MigrationTargetDeploymentRecord = {
  chainId: 196,
  commit: "abc123",
  deployedAt: "2026-05-12T00:00:00.000Z",
  deployer: "0x0000000000000000000000000000000000000007",
  migrationTarget: deployment.migrationTarget,
  transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000008",
  uniswapV4PoolManager: deployment.uniswapV4PoolManager,
  uniswapV4PositionManager: deployment.uniswapV4PositionManager,
  lpRecipient: "0x000000000000000000000000000000000000dEaD",
};

const env: NodeJS.ProcessEnv = {
  DEPLOYMENT_NETWORK: "xlayer",
  LP_RECIPIENT: migrationTargetDeployment.lpRecipient,
  MIGRATION_TARGET: deployment.migrationTarget,
  TEAM_MULTISIG: deployment.feeRecipient,
  UNISWAP_V4_POOL_MANAGER: deployment.uniswapV4PoolManager,
  UNISWAP_V4_POSITION_MANAGER: deployment.uniswapV4PositionManager,
  XLAYER_RPC_URL: "https://rpc.xlayer.example",
};

test("doctorXLayerReadinessConsistency accepts matching deployment records and env", () => {
  assert.deepEqual(doctorXLayerReadinessConsistency(deployment, migrationTargetDeployment, env), {
    ok: true,
    errors: [],
    warnings: [],
  });
});

test("doctorXLayerReadinessConsistency rejects mismatched deployment records and env", () => {
  const result = doctorXLayerReadinessConsistency({
    ...deployment,
    chainId: 31337,
    migrationTarget: "0x0000000000000000000000000000000000000011",
  }, {
    ...migrationTargetDeployment,
    uniswapV4PoolManager: "0x0000000000000000000000000000000000000012",
    lpRecipient: deployment.deployer,
  }, {
    ...env,
    TEAM_MULTISIG: "0x0000000000000000000000000000000000000013",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "deployment chainId 31337 does not match migration target deployment chainId 196",
    "deployment migrationTarget 0x0000000000000000000000000000000000000011 does not match migration target deployment migrationTarget 0x0000000000000000000000000000000000000006",
    "deployment uniswapV4PoolManager 0x0000000000000000000000000000000000000004 does not match migration target deployment uniswapV4PoolManager 0x0000000000000000000000000000000000000012",
    "TEAM_MULTISIG does not match deployment feeRecipient",
    "MIGRATION_TARGET does not match deployment migrationTarget",
    "UNISWAP_V4_POOL_MANAGER does not match migration target deployment uniswapV4PoolManager",
    "LP_RECIPIENT does not match migration target deployment lpRecipient",
    "LP_RECIPIENT must not equal deployment deployer",
  ]);
});

test("doctorXLayerReadinessConsistency rejects PositionManager record and env mismatches", () => {
  const result = doctorXLayerReadinessConsistency({
    ...deployment,
    uniswapV4PositionManager: "0x0000000000000000000000000000000000000014",
  }, migrationTargetDeployment, {
    ...env,
    UNISWAP_V4_POSITION_MANAGER: "0x0000000000000000000000000000000000000015",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "deployment uniswapV4PositionManager 0x0000000000000000000000000000000000000014 does not match migration target deployment uniswapV4PositionManager 0x0000000000000000000000000000000000000005",
    "UNISWAP_V4_POSITION_MANAGER does not match migration target deployment uniswapV4PositionManager",
  ]);
});
