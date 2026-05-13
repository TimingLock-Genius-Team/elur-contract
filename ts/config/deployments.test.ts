import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import test from "node:test";
import { deploymentPath, readDeployment, writeDeployment, type Deployment } from "./deployments.js";

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
  curve: {
    k: "1",
    s: "2",
    feeBps: 30,
    selfDeprecationBps: 9900,
    maxBuyOkb: "3",
  },
  createdTokens: [],
};

test("config deployment IO uses selected network path", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-config-deployments-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    writeDeployment(deployment);

    assert.equal(deploymentPath(), join(cwd(), "deployments", "xlayer", "latest.json"));
    assert.equal(existsSync(deploymentPath()), true);
    assert.deepEqual(readDeployment(), deployment);
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
