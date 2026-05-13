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
} from "./migration-target-deployment.js";

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
