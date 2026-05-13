import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import test from "node:test";
import {
  migrationTargetDeploymentPath,
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
