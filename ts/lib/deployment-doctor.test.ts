import { strict as assert } from "node:assert";
import test from "node:test";
import { doctorDeployment, type DeploymentCodeReader } from "./deployment-doctor.js";
import type { Deployment } from "./deployments.js";

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
  curve: {
    k: "21000000000000000000000000",
    s: "100000000000000000000",
    feeBps: 30,
    selfDeprecationBps: 9900,
    maxBuyOkb: "10000000000000000000",
  },
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
