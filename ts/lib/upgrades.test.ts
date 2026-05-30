import { strict as assert } from "node:assert";
import test from "node:test";
import type { Deployment } from "../config/deployments.js";
import {
  applyHookImplementationMetadata,
  applyRouterImplementationMetadata,
  resolveHookUpgradeTargets,
  resolveRouterUpgradeTargets,
} from "./upgrades.js";

const deployment: Deployment = {
  chainId: 133,
  commit: "abc123",
  deployedAt: "2026-05-14T00:00:00.000Z",
  deployer: "0x0000000000000000000000000000000000000001",
  factory: "0x0000000000000000000000000000000000000002",
  proxyAdmin: "0x0000000000000000000000000000000000000003",
  factoryImplementation: "0x0000000000000000000000000000000000000004",
    hookImplementation: "0x0000000000000000000000000000000000000006",
  routerImplementation: "0x0000000000000000000000000000000000000005",
  feeRecipient: "0x0000000000000000000000000000000000000006",
  uniswapV4PoolManager: "0x0000000000000000000000000000000000000007",
  uniswapV4PositionManager: "0x0000000000000000000000000000000000000008",
  migrationTarget: "0x0000000000000000000000000000000000000009",
  curve: {
    k: "1",
    s: "2",
    feeBps: 30,
    burnTaxMinBps: 100,
    burnTaxMaxBps: 1000,
    selfDeprecationBps: 8000,
    maxBuyOkb: "3",
  },
  createdTokens: [
    {
      token: "0x0000000000000000000000000000000000000010",
      hook: "0x0000000000000000000000000000000000000011",
      router: "0x0000000000000000000000000000000000000012",
      curveS: 25,
      hookImplementation: "0x0000000000000000000000000000000000000006",
    },
    {
      token: "0x0000000000000000000000000000000000000013",
      hook: "0x0000000000000000000000000000000000000014",
      router: "0x0000000000000000000000000000000000000015",
      curveS: 100,
      hookImplementation: "0x0000000000000000000000000000000000000006",
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

test("resolveHookUpgradeTargets returns all recorded hooks for --all", () => {
  assert.deepEqual(resolveHookUpgradeTargets(deployment, { all: true }), {
    hooks: [
      "0x0000000000000000000000000000000000000011",
      "0x0000000000000000000000000000000000000014",
    ],
    updateFactoryDefault: true,
  });
});

test("upgrade target resolution ignores direct v4 launch metadata", () => {
  const next: Deployment = JSON.parse(JSON.stringify(deployment)) as Deployment;
  next.createdTokens.push({
    token: "0x0000000000000000000000000000000000000030",
    hook: "0x0000000000000000000000000000000000000031",
    router: "0x0000000000000000000000000000000000000031",
    v4Hooks: "0x0000000000000000000000000000000000000032",
    launchMode: "DIRECT_V4_HOOK_POOL",
  });

  assert.deepEqual(resolveHookUpgradeTargets(next, { all: true }).hooks, [
    "0x0000000000000000000000000000000000000011",
    "0x0000000000000000000000000000000000000014",
  ]);
  assert.deepEqual(resolveRouterUpgradeTargets(next, { all: true }).routers, [
    "0x0000000000000000000000000000000000000012",
    "0x0000000000000000000000000000000000000015",
  ]);
  assert.throws(
    () => resolveHookUpgradeTargets(next, { hook: "0x0000000000000000000000000000000000000031" }),
    /not recorded in deployment JSON/,
  );
  assert.throws(
    () => resolveRouterUpgradeTargets(next, { router: "0x0000000000000000000000000000000000000031" }),
    /not recorded in deployment JSON/,
  );
});

test("applyHookImplementationMetadata updates targeted hooks and optionally default", () => {
  const next: Deployment = JSON.parse(JSON.stringify(deployment)) as Deployment;
  applyHookImplementationMetadata(next, {
    hooks: ["0x0000000000000000000000000000000000000011"],
    implementation: "0x0000000000000000000000000000000000000021",
    updateFactoryDefault: false,
  });

  assert.equal(next.hookImplementation, deployment.hookImplementation);
  assert.equal(next.createdTokens[0].hookImplementation, "0x0000000000000000000000000000000000000021");
  assert.equal(next.createdTokens[1].hookImplementation, deployment.hookImplementation);
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
