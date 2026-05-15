import { getAddress, isAddress } from "viem";
import type { Deployment } from "../config/deployments.js";

export type RouterUpgradeTargets = {
  routers: `0x${string}`[];
  updateFactoryDefault: boolean;
};

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
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
    const routers = deployment.createdTokens.map((entry) => entry.router);
    if (routers.length === 0) {
      throw new Error("No router proxies recorded in deployment JSON");
    }
    return { routers, updateFactoryDefault: true };
  }

  const router = getAddress(options.router!);
  const recorded = deployment.createdTokens.some((entry) => sameAddress(entry.router, router));
  if (!recorded) {
    throw new Error(`Router ${router} is not recorded in deployment JSON`);
  }

  return { routers: [router], updateFactoryDefault: false };
}

export function applyRouterImplementationMetadata(
  deployment: Deployment,
  options: { routers: readonly `0x${string}`[]; implementation: `0x${string}`; updateFactoryDefault: boolean },
): void {
  if (options.updateFactoryDefault) {
    deployment.routerImplementation = options.implementation;
  }

  for (const entry of deployment.createdTokens) {
    if (options.routers.some((router) => sameAddress(router, entry.router))) {
      entry.routerImplementation = options.implementation;
    }
  }
}
