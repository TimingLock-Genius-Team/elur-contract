import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import test from "node:test";
import {
  migrationTargetDeploymentPath,
  readMigrationTargetDeployment,
  writeMigrationTargetDeployment,
  type MigrationTargetDeploymentRecord,
} from "./migration-target-deployments.js";

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
  migrationPool: {
    hooks: "0x0000000000000000000000000000000000000000",
    poolFee: 3000,
    tickSpacing: 60,
    tickLower: -887220,
    tickUpper: 887220,
    migrationLiquidity: "1000000000000000000",
    hookDataHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  },
};

test("config migration target deployment IO writes canonical record path", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-config-migration-target-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    writeMigrationTargetDeployment(record);

    const path = join(cwd(), "deployments", "xlayer", "uniswap-v4-mint-position-target.json");
    assert.equal(migrationTargetDeploymentPath(), path);
    assert.equal(existsSync(path), true);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), record);
  } finally {
    chdir(originalCwd);
    if (originalNetwork === undefined) {
      delete process.env.DEPLOYMENT_NETWORK;
    } else {
      process.env.DEPLOYMENT_NETWORK = originalNetwork;
    }
    process.argv = originalArgv;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("readMigrationTargetDeployment rejects malformed deployment JSON", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-config-migration-target-invalid-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    const path = migrationTargetDeploymentPath();
    mkdirSync(join(tempDir, "deployments", "xlayer"), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ ...record, migrationTarget: "not-an-address" })}\n`);

    assert.throws(() => readMigrationTargetDeployment(), /migrationTarget must be a valid address/);
  } finally {
    chdir(originalCwd);
    if (originalNetwork === undefined) {
      delete process.env.DEPLOYMENT_NETWORK;
    } else {
      process.env.DEPLOYMENT_NETWORK = originalNetwork;
    }
    process.argv = originalArgv;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("readMigrationTargetDeployment rejects impossible migration pool config", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-config-migration-target-pool-invalid-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    const path = migrationTargetDeploymentPath();
    mkdirSync(join(tempDir, "deployments", "xlayer"), { recursive: true });
    writeFileSync(path, `${JSON.stringify({
      ...record,
      migrationPool: { ...record.migrationPool, migrationLiquidity: (1n << 128n).toString() },
    })}\n`);

    assert.throws(() => readMigrationTargetDeployment(), /migrationPool\.migrationLiquidity/);
  } finally {
    chdir(originalCwd);
    if (originalNetwork === undefined) {
      delete process.env.DEPLOYMENT_NETWORK;
    } else {
      process.env.DEPLOYMENT_NETWORK = originalNetwork;
    }
    process.argv = originalArgv;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
