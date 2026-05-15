import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { defaultCurveParams } from "../config/params.js";
import { doctorDeployment, type DeploymentCodeReader } from "./deployment-doctor.js";
import type { Deployment } from "../config/deployments.js";

const validDeployment: Deployment = {
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
  createdTokens: [
    {
      token: "0x0000000000000000000000000000000000000007",
      hook: "0x0000000000000000000000000000000000000008",
      router: "0x0000000000000000000000000000000000000009",
    },
  ],
};

function codeReaderWithCode(chainId = 196): DeploymentCodeReader {
  return {
    getChainId: async () => chainId,
    getCode: async () => "0x6000",
  };
}

test("doctorDeployment accepts a structurally valid deployment", async () => {
  const result = await doctorDeployment(validDeployment, {
    expectedChainId: 196,
    codeReader: codeReaderWithCode(),
  });

  assert.deepEqual(result, { ok: true, errors: [], warnings: [] });
});

test("doctorDeployment reports required field and address shape failures", async () => {
  const invalid = {
    ...validDeployment,
    commit: "",
    factory: "not-an-address",
    createdTokens: [{ token: validDeployment.createdTokens[0].token, hook: "0x123", router: "" }],
  };

  const result = await doctorDeployment(invalid);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "commit is required",
    "factory must be a valid address",
    "createdTokens[0].hook must be a valid address",
    "createdTokens[0].router must be a valid address",
  ]);
});

test("doctorDeployment reports configured and RPC chainId mismatches", async () => {
  const result = await doctorDeployment(validDeployment, {
    expectedChainId: 31337,
    codeReader: codeReaderWithCode(1),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "deployment chainId 196 does not match expected chainId 31337",
    "deployment chainId 196 does not match RPC chainId 1",
  ]);
});

test("doctorDeployment checks deployed contract code when a reader is available", async () => {
  const codeReader: DeploymentCodeReader = {
    getChainId: async () => 196,
    getCode: async ({ address }) => (address === validDeployment.factory ? "0x" : "0x6000"),
  };

  const result = await doctorDeployment(validDeployment, { codeReader });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    `${validDeployment.factory} has no code for factory`,
  ]);
});

test("doctorDeployment checks Factory immutable config when a reader is available", async () => {
  const codeReader: DeploymentCodeReader = {
    getCode: async () => "0x6000",
    getFactoryConfig: async () => ({
      feeRecipient: "0x0000000000000000000000000000000000000011",
      migrationTarget: "0x0000000000000000000000000000000000000012",
    }),
  };

  const result = await doctorDeployment(validDeployment, { codeReader });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    `Factory feeRecipient 0x0000000000000000000000000000000000000011 does not match deployment feeRecipient ${validDeployment.feeRecipient}`,
    `Factory migrationTarget 0x0000000000000000000000000000000000000012 does not match deployment migrationTarget ${validDeployment.migrationTarget}`,
  ]);
});

test("doctorDeployment validates proxy metadata code and Factory proxy config", async () => {
  const proxiedDeployment: Deployment = {
    ...validDeployment,
    proxyAdmin: "0x0000000000000000000000000000000000000010",
    factoryImplementation: "0x0000000000000000000000000000000000000011",
    routerImplementation: "0x0000000000000000000000000000000000000012",
    createdTokens: [
      {
        ...validDeployment.createdTokens[0],
        routerImplementation: "0x0000000000000000000000000000000000000012",
      },
    ],
  };
  const checked: string[] = [];
  const codeReader: DeploymentCodeReader = {
    getCode: async ({ address }) => {
      checked.push(address);
      return "0x6000";
    },
    getFactoryConfig: async () => ({
      feeRecipient: proxiedDeployment.feeRecipient,
      migrationTarget: proxiedDeployment.migrationTarget,
      routerImplementation: proxiedDeployment.routerImplementation,
      proxyAdmin: proxiedDeployment.proxyAdmin,
    }),
  };

  const result = await doctorDeployment(proxiedDeployment, { codeReader });

  assert.deepEqual(result, { ok: true, errors: [], warnings: [] });
  assert.ok(checked.includes(proxiedDeployment.proxyAdmin!));
  assert.ok(checked.includes(proxiedDeployment.factoryImplementation!));
  assert.ok(checked.includes(proxiedDeployment.routerImplementation!));
});

test("doctorDeployment reports Factory proxy metadata mismatches", async () => {
  const proxiedDeployment: Deployment = {
    ...validDeployment,
    proxyAdmin: "0x0000000000000000000000000000000000000010",
    routerImplementation: "0x0000000000000000000000000000000000000012",
  };
  const codeReader: DeploymentCodeReader = {
    getCode: async () => "0x6000",
    getFactoryConfig: async () => ({
      feeRecipient: proxiedDeployment.feeRecipient,
      migrationTarget: proxiedDeployment.migrationTarget,
      routerImplementation: "0x0000000000000000000000000000000000000013",
      proxyAdmin: "0x0000000000000000000000000000000000000014",
    }),
  };

  const result = await doctorDeployment(proxiedDeployment, { codeReader });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "Factory routerImplementation 0x0000000000000000000000000000000000000013 does not match deployment routerImplementation 0x0000000000000000000000000000000000000012",
    "Factory proxy admin 0x0000000000000000000000000000000000000014 does not match deployment proxyAdmin 0x0000000000000000000000000000000000000010",
  ]);
});

test("doctorDeployment fails when Factory immutable config cannot be read", async () => {
  const codeReader: DeploymentCodeReader = {
    getCode: async () => "0x6000",
    getFactoryConfig: async () => {
      throw new Error("missing selector");
    },
  };

  const result = await doctorDeployment(validDeployment, { codeReader });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    `Could not check Factory config at ${validDeployment.factory}: missing selector`,
  ]);
  assert.deepEqual(result.warnings, []);
});

test("doctor-deployment CLI rejects invalid --chain-id values before running checks", () => {
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-doctor-cli-"));
  const deploymentDir = join(tempDir, "deployments", "anvil");
  const scriptPath = fileURLToPath(new URL("../cli/doctor-deployment.ts", import.meta.url));
  const tsxLoaderPath = fileURLToPath(new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url));

  mkdirSync(deploymentDir, { recursive: true });
  writeFileSync(join(deploymentDir, "latest.json"), `${JSON.stringify(validDeployment, null, 2)}\n`);
  chdir(tempDir);

  try {
    const result = spawnSync(process.execPath, [
      "--import",
      tsxLoaderPath,
      scriptPath,
      "--chain-id",
      "not-a-number",
    ], {
      cwd: tempDir,
      env: {
        ...process.env,
        ANVIL_RPC_URL: "",
        DEPLOYMENT_NETWORK: "",
        NODE_OPTIONS: "--no-warnings",
        RPC_URL: "",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), {
      network: "anvil",
      path: join(realpathSync(tempDir), "deployments", "anvil", "latest.json"),
      rpcChecked: false,
      ok: false,
      errors: ["--chain-id must be a positive integer"],
      warnings: [],
    });
  } finally {
    chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("doctor-deployment CLI emits JSON when --network is missing a value", () => {
  const scriptPath = fileURLToPath(new URL("../cli/doctor-deployment.ts", import.meta.url));
  const tsxLoaderPath = fileURLToPath(new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url));

  const result = spawnSync(process.execPath, [
    "--import",
    tsxLoaderPath,
    scriptPath,
    "--network",
    "--chain-id",
    "196",
  ], {
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-warnings",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    ok: false,
    errors: ["Missing value for --network"],
    warnings: [],
  });
  assert.equal(result.stderr, "");
});

test("doctor-deployment CLI accepts a valid explicit --chain-id override", () => {
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-doctor-cli-valid-"));
  const deploymentDir = join(tempDir, "deployments", "xlayer");
  const scriptPath = fileURLToPath(new URL("../cli/doctor-deployment.ts", import.meta.url));
  const tsxLoaderPath = fileURLToPath(new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url));

  mkdirSync(deploymentDir, { recursive: true });
  writeFileSync(join(deploymentDir, "latest.json"), `${JSON.stringify(validDeployment, null, 2)}\n`);
  chdir(tempDir);

  try {
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
      env: {
        ...process.env,
        DEPLOYMENT_NETWORK: "",
        NODE_OPTIONS: "--no-warnings",
        RPC_URL: "",
        XLAYER_RPC_URL: "",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      network: "xlayer",
      path: join(realpathSync(tempDir), "deployments", "xlayer", "latest.json"),
      expectedChainId: 196,
      rpcChecked: false,
      ok: true,
      errors: [],
      warnings: [],
    });
  } finally {
    chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("doctor-deployment CLI defaults hashkeytest to chain id 133", () => {
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-doctor-cli-hashkeytest-"));
  const deploymentDir = join(tempDir, "deployments", "hashkeytest");
  const scriptPath = fileURLToPath(new URL("../cli/doctor-deployment.ts", import.meta.url));
  const tsxLoaderPath = fileURLToPath(new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url));
  const hashkeyDeployment = { ...validDeployment, chainId: 133 };

  mkdirSync(deploymentDir, { recursive: true });
  writeFileSync(join(deploymentDir, "latest.json"), `${JSON.stringify(hashkeyDeployment, null, 2)}\n`);
  chdir(tempDir);

  try {
    const result = spawnSync(process.execPath, [
      "--import",
      tsxLoaderPath,
      scriptPath,
      "--network",
      "hashkeytest",
    ], {
      cwd: tempDir,
      env: {
        ...process.env,
        DEPLOYMENT_NETWORK: "",
        HASHKEYTEST_RPC_URL: "",
        NODE_OPTIONS: "--no-warnings",
        RPC_URL: "",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      network: "hashkeytest",
      path: join(realpathSync(tempDir), "deployments", "hashkeytest", "latest.json"),
      expectedChainId: 133,
      rpcChecked: false,
      ok: true,
      errors: [],
      warnings: [],
    });
  } finally {
    chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("doctor-deployment CLI redacts RPC URLs from diagnostics", () => {
  const originalCwd = cwd();
  const tempDir = mkdtempSync(join(tmpdir(), "eulr-doctor-cli-redact-"));
  const deploymentDir = join(tempDir, "deployments", "xlayer");
  const scriptPath = fileURLToPath(new URL("../cli/doctor-deployment.ts", import.meta.url));
  const tsxLoaderPath = fileURLToPath(new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url));
  const secretRpcUrl = "http://127.0.0.1:1/super-secret-rpc-key";

  mkdirSync(deploymentDir, { recursive: true });
  writeFileSync(join(deploymentDir, "latest.json"), `${JSON.stringify(validDeployment, null, 2)}\n`);
  chdir(tempDir);

  try {
    const result = spawnSync(process.execPath, [
      "--import",
      tsxLoaderPath,
      scriptPath,
      "--network",
      "xlayer",
      "--rpc-url",
      secretRpcUrl,
      "--chain-id",
      "196",
    ], {
      cwd: tempDir,
      env: {
        ...process.env,
        DEPLOYMENT_NETWORK: "",
        NODE_OPTIONS: "--no-warnings",
        RPC_URL: "",
        XLAYER_RPC_URL: "",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /super-secret-rpc-key/);
    assert.match(result.stdout, /\$RPC_URL/);
  } finally {
    chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});
