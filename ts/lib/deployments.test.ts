import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chdir, cwd } from "node:process";
import { deploymentPath, readDeployment, writeDeployment, type Deployment } from "./deployments.js";

function restoreDeploymentNetwork(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.DEPLOYMENT_NETWORK;
    return;
  }

  process.env.DEPLOYMENT_NETWORK = value;
}

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
  createdTokens: [
    {
      token: "0x0000000000000000000000000000000000000007",
      hook: "0x0000000000000000000000000000000000000008",
      router: "0x0000000000000000000000000000000000000009",
      curveS: 25,
    },
  ],
};

test("deploymentPath defaults to anvil", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  delete process.env.DEPLOYMENT_NETWORK;
  process.argv = ["node", "script"];

  try {
    assert.equal(deploymentPath(), join(cwd(), "deployments", "anvil", "latest.json"));
  } finally {
    restoreDeploymentNetwork(originalNetwork);
    process.argv = originalArgv;
  }
});

test("deploymentPath uses DEPLOYMENT_NETWORK", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];

  try {
    assert.equal(deploymentPath(), join(cwd(), "deployments", "xlayer", "latest.json"));
  } finally {
    restoreDeploymentNetwork(originalNetwork);
    process.argv = originalArgv;
  }
});

test("deploymentPath prefers --network over DEPLOYMENT_NETWORK", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script", "--network", "base"];

  try {
    assert.equal(deploymentPath(), join(cwd(), "deployments", "base", "latest.json"));
  } finally {
    restoreDeploymentNetwork(originalNetwork);
    process.argv = originalArgv;
  }
});

test("deploymentPath rejects network names that escape the deployments directory", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  delete process.env.DEPLOYMENT_NETWORK;
  process.argv = ["node", "script", "--network", "../xlayer"];

  try {
    assert.throws(() => deploymentPath(), /Invalid deployment network/);
  } finally {
    restoreDeploymentNetwork(originalNetwork);
    process.argv = originalArgv;
  }
});

test("readDeployment and writeDeployment use the selected network", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-deployments-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    writeDeployment(deployment);

    assert.equal(existsSync(join(tempDir, "deployments", "xlayer", "latest.json")), true);
    assert.deepEqual(readDeployment(), deployment);
  } finally {
    chdir(originalCwd);
    restoreDeploymentNetwork(originalNetwork);
    process.argv = originalArgv;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
