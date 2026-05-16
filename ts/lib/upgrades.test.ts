import { strict as assert } from "node:assert";
import test from "node:test";
import type { Deployment } from "../config/deployments.js";
import { applyRouterImplementationMetadata, resolveRouterUpgradeTargets } from "./upgrades.js";

const deployment: Deployment = {
  chainId: 133,
  commit: "abc123",
  deployedAt: "2026-05-14T00:00:00.000Z",
  deployer: "0x0000000000000000000000000000000000000001",
  factory: "0x0000000000000000000000000000000000000002",
  proxyAdmin: "0x0000000000000000000000000000000000000003",
  factoryImplementation: "0x0000000000000000000000000000000000000004",
  routerImplementation: "0x0000000000000000000000000000000000000005",
  feeRecipient: "0x0000000000000000000000000000000000000006",
  uniswapV4PoolManager: "0x0000000000000000000000000000000000000007",
  uniswapV4PositionManager: "0x0000000000000000000000000000000000000008",
  migrationTarget: "0x0000000000000000000000000000000000000009",
  curve: {
    k: "1",
    s: "2",
    feeBps: 30,
    selfDeprecationBps: 8000,
    maxBuyOkb: "3",
  },
  createdTokens: [
    {
      token: "0x0000000000000000000000000000000000000010",
      hook: "0x0000000000000000000000000000000000000011",
      router: "0x0000000000000000000000000000000000000012",
      curveS: 25,
    },
    {
      token: "0x0000000000000000000000000000000000000013",
      hook: "0x0000000000000000000000000000000000000014",
      router: "0x0000000000000000000000000000000000000015",
      curveS: 100,
    },
  ],
};

test("resolveRouterUpgradeTargets rejects unrecorded router addresses", () => {
  assert.throws(
    () =>
      resolveRouterUpgradeTargets(deployment, {
        router: "0x0000000000000000000000000000000000000099",
        all: false,
      }),
    /Router 0x0000000000000000000000000000000000000099 is not recorded in deployment JSON/,
  );
});

test("resolveRouterUpgradeTargets returns all recorded routers for --all", () => {
  assert.deepEqual(resolveRouterUpgradeTargets(deployment, { all: true }), {
    routers: [
      "0x0000000000000000000000000000000000000012",
      "0x0000000000000000000000000000000000000015",
    ],
    updateFactoryDefault: true,
  });
});

test("applyRouterImplementationMetadata updates only targeted routers unless default is requested", () => {
  const next: Deployment = JSON.parse(JSON.stringify(deployment)) as Deployment;
  applyRouterImplementationMetadata(next, {
    routers: ["0x0000000000000000000000000000000000000012"],
    implementation: "0x0000000000000000000000000000000000000020",
    updateFactoryDefault: false,
  });

  assert.equal(next.routerImplementation, deployment.routerImplementation);
  assert.equal(next.createdTokens[0].routerImplementation, "0x0000000000000000000000000000000000000020");
  assert.equal(next.createdTokens[1].routerImplementation, undefined);
});
