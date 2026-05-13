import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import test from "node:test";
import {
  doctorMigrationTargetDeployment,
  migrationTargetDeploymentPath,
  writeMigrationTargetDeployment,
  type MigrationTargetDeploymentRecord,
} from "./migration-target-deployment.js";
import type { DeploymentCodeReader } from "./deployment-doctor.js";

function restoreDeploymentNetwork(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.DEPLOYMENT_NETWORK;
    return;
  }

  process.env.DEPLOYMENT_NETWORK = value;
}

const record: MigrationTargetDeploymentRecord = {
  chainId: 196,
  commit: "abc123",
  deployedAt: "2026-05-12T00:00:00.000Z",
  deployer: "0x0000000000000000000000000000000000000001",
  migrationTarget: "0x0000000000000000000000000000000000000002",
  transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000005",
  uniswapV4PoolManager: "0x0000000000000000000000000000000000000003",
  uniswapV4PositionManager: "0x0000000000000000000000000000000000000004",
  lpRecipient: "0x000000000000000000000000000000000000dEaD",
};

test("migrationTargetDeploymentPath uses DEPLOYMENT_NETWORK", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];

  try {
    assert.equal(
      migrationTargetDeploymentPath(),
      join(cwd(), "deployments", "xlayer", "uniswap-v4-mint-position-target.json"),
    );
  } finally {
    restoreDeploymentNetwork(originalNetwork);
    process.argv = originalArgv;
  }
});

test("writeMigrationTargetDeployment records constructor dependencies", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "satpad-migration-target-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    writeMigrationTargetDeployment(record);

    const path = join(tempDir, "deployments", "xlayer", "uniswap-v4-mint-position-target.json");
    assert.equal(existsSync(path), true);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), record);
  } finally {
    chdir(originalCwd);
    restoreDeploymentNetwork(originalNetwork);
    process.argv = originalArgv;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("doctorMigrationTargetDeployment reports malformed records", async () => {
  const result = await doctorMigrationTargetDeployment({
    ...record,
    commit: "",
    migrationTarget: "not-an-address",
    transactionHash: "0x123",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "commit is required",
    "transactionHash must be a 32-byte hex string",
    "migrationTarget must be a valid address",
  ]);
});

test("doctorMigrationTargetDeployment checks chain id and deployed code", async () => {
  const codeReader: DeploymentCodeReader = {
    getChainId: async () => 31337,
    getCode: async ({ address }) => (address === record.migrationTarget ? "0x" : "0x6000"),
  };

  const result = await doctorMigrationTargetDeployment(record, {
    expectedChainId: 196,
    codeReader,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "migration target deployment chainId 196 does not match RPC chainId 31337",
    `${record.migrationTarget} has no code for migrationTarget`,
  ]);
});

test("doctor-migration-target CLI validates a recorded target without RPC", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "satpad-migration-target-cli-"));
  const scriptPath = join(originalCwd, "ts", "cli", "doctor-migration-target.ts");
  const tsxLoaderPath = join(originalCwd, "node_modules", "tsx", "dist", "loader.mjs");

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    writeMigrationTargetDeployment(record);

    const result = spawnSync(process.execPath, [
      "--import",
      tsxLoaderPath,
      scriptPath,
      "--network",
      "xlayer",
      "--chain-id",
      "196",
    ], {
      cwd: tempDir,
      env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      network: "xlayer",
      path: join(realpathSync(tempDir), "deployments", "xlayer", "uniswap-v4-mint-position-target.json"),
      expectedChainId: 196,
      rpcChecked: false,
      ok: true,
      errors: [],
      warnings: [],
    });
  } finally {
    chdir(originalCwd);
    restoreDeploymentNetwork(originalNetwork);
    process.argv = originalArgv;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
