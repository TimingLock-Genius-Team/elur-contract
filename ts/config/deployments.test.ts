import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

test("readDeployment rejects malformed deployment JSON", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-config-deployments-invalid-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    const path = deploymentPath();
    mkdirSync(join(tempDir, "deployments", "xlayer"), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ ...deployment, factory: "not-an-address" })}\n`);

    assert.throws(() => readDeployment(), /factory must be a valid address/);
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

test("readDeployment accepts created token curveS in the contract range", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-config-deployments-curve-s-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    const withCurveS: Deployment = {
      ...deployment,
      createdTokens: [
        {
          token: "0x0000000000000000000000000000000000000007",
          hook: "0x0000000000000000000000000000000000000008",
          router: "0x0000000000000000000000000000000000000009",
          curveS: 25,
        },
      ],
    };
    writeDeployment(withCurveS);

    assert.deepEqual(readDeployment(), withCurveS);
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

test("readDeployment accepts proxy metadata for factory and created router proxies", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-config-deployments-proxy-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    const proxiedDeployment: Deployment = {
      ...deployment,
      proxyAdmin: "0x0000000000000000000000000000000000000010",
      factoryImplementation: "0x0000000000000000000000000000000000000011",
      routerImplementation: "0x0000000000000000000000000000000000000012",
      createdTokens: [
        {
          token: "0x0000000000000000000000000000000000000007",
          hook: "0x0000000000000000000000000000000000000008",
          router: "0x0000000000000000000000000000000000000009",
          curveS: 25,
          routerImplementation: "0x0000000000000000000000000000000000000012",
        },
      ],
    };
    writeDeployment(proxiedDeployment);

    assert.deepEqual(readDeployment(), proxiedDeployment);
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

test("readDeployment rejects invalid proxy metadata addresses", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-config-deployments-invalid-proxy-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    const path = deploymentPath();
    mkdirSync(join(tempDir, "deployments", "xlayer"), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ ...deployment, proxyAdmin: "not-an-address" })}\n`);

    assert.throws(() => readDeployment(), /proxyAdmin must be a valid address/);
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

test("readDeployment rejects created token curveS outside the contract range", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalArgv = process.argv;
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-config-deployments-invalid-curve-s-"));

  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.argv = ["node", "script"];
  chdir(tempDir);

  try {
    const path = deploymentPath();
    mkdirSync(join(tempDir, "deployments", "xlayer"), { recursive: true });
    writeFileSync(path, `${JSON.stringify({
      ...deployment,
      createdTokens: [
        {
          token: "0x0000000000000000000000000000000000000007",
          hook: "0x0000000000000000000000000000000000000008",
          router: "0x0000000000000000000000000000000000000009",
          curveS: 1001,
        },
      ],
    })}\n`);

    assert.throws(() => readDeployment(), /createdTokens\[0\]\.curveS must be an integer between 1 and 1000/);
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
