import { getAddress, isAddress } from "viem";
import type { Deployment } from "../config/deployments.js";

export type RouterUpgradeTargets = {
  routers: `0x${string}`[];
  updateFactoryDefault: boolean;
};

export type HookUpgradeTargets = {
  hooks: `0x${string}`[];
  updateFactoryDefault: boolean;
};

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function proxyLaunches(deployment: Deployment): Deployment["createdTokens"] {
  return deployment.createdTokens.filter((entry) => entry.launchMode !== "DIRECT_V4_HOOK_POOL");
}

export function resolveRouterUpgradeTargets(
  deployment: Deployment,
  options: { router?: string; all?: boolean },
): RouterUpgradeTargets {
  if (options.router && options.all) {
    throw new Error("Use either --router or --all, not both");
  }
  if (!options.router && !options.all) {
    throw new Error("Specify --router <address> or --all");
  }
  if (options.router && !isAddress(options.router)) {
    throw new Error("--router must be a valid address");
  }

  if (options.all) {
    const routers = proxyLaunches(deployment).map((entry) => entry.router);
    if (routers.length === 0) {
      throw new Error("No router proxies recorded in deployment JSON");
    }
    return { routers, updateFactoryDefault: true };
  }

  const router = getAddress(options.router!);
  const recorded = proxyLaunches(deployment).some((entry) => sameAddress(entry.router, router));
  if (!recorded) {
    throw new Error(`Router ${router} is not recorded in deployment JSON`);
  }

  return { routers: [router], updateFactoryDefault: false };
}

export function resolveHookUpgradeTargets(
  deployment: Deployment,
  options: { hook?: string; all?: boolean },
): HookUpgradeTargets {
  if (options.hook && options.all) {
    throw new Error("Use either --hook or --all, not both");
  }
  if (!options.hook && !options.all) {
    throw new Error("Specify --hook <address> or --all");
  }
  if (options.hook && !isAddress(options.hook)) {
    throw new Error("--hook must be a valid address");
  }

  if (options.all) {
    const hooks = proxyLaunches(deployment).map((entry) => entry.hook);
    if (hooks.length === 0) {
      throw new Error("No hook proxies recorded in deployment JSON");
    }
    return { hooks, updateFactoryDefault: true };
  }

  const hook = getAddress(options.hook!);
  const recorded = proxyLaunches(deployment).some((entry) => sameAddress(entry.hook, hook));
  if (!recorded) {
    throw new Error(`Hook ${hook} is not recorded in deployment JSON`);
  }

  return { hooks: [hook], updateFactoryDefault: false };
}

export function applyRouterImplementationMetadata(
  deployment: Deployment,
  options: { routers: readonly `0x${string}`[]; implementation: `0x${string}`; updateFactoryDefault: boolean },
): void {
  if (options.updateFactoryDefault) {
    deployment.routerImplementation = options.implementation;
  }

  for (const entry of proxyLaunches(deployment)) {
    if (options.routers.some((router) => sameAddress(router, entry.router))) {
      entry.routerImplementation = options.implementation;
    }
  }
}

export function applyHookImplementationMetadata(
  deployment: Deployment,
  options: { hooks: readonly `0x${string}`[]; implementation: `0x${string}`; updateFactoryDefault: boolean },
): void {
  if (options.updateFactoryDefault) {
    deployment.hookImplementation = options.implementation;
  }

  for (const entry of proxyLaunches(deployment)) {
    if (options.hooks.some((hook) => sameAddress(hook, entry.hook))) {
      entry.hookImplementation = options.implementation;
    }
  }
}
