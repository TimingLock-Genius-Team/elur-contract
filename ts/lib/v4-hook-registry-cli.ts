import { getAddress, isAddress } from "viem";
import { artifacts } from "../config/artifacts.js";
import { readDeployment } from "../config/deployments.js";
import { abiOf } from "./artifacts.js";
import { optionalArg } from "./args.js";

export const registryAbi = abiOf(artifacts.eulrHookRegistry);
export const directV4LaunchFactoryAbi = abiOf(artifacts.eulrDirectV4LaunchFactory);

export function registryAddress(): `0x${string}` {
  const deployment = readDeployment();
  const address = optionalArg("registry") ?? deployment.hookRegistry;
  if (!address || !isAddress(address)) {
    throw new Error("--registry or deployment.hookRegistry is required");
  }
  return getAddress(address);
}

export function directV4LaunchFactoryAddress(): `0x${string}` {
  const deployment = readDeployment();
  const address = optionalArg("direct-v4-launch-factory") ?? deployment.directV4LaunchFactory;
  if (!address || !isAddress(address)) {
    throw new Error("--direct-v4-launch-factory or deployment.directV4LaunchFactory is required");
  }
  return getAddress(address);
}

export function bytes32Arg(value: string, name: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`--${name} must be a bytes32 hex string`);
  }
  return value as `0x${string}`;
}

export function optionalBytes32Arg(name: string): `0x${string}` {
  return bytes32Arg(optionalArg(name) ?? `0x${"0".repeat(64)}`, name);
}

export function bigintArg(value: string, name: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return BigInt(value);
}

export function numberArg(value: string, name: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`--${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`--${name} is outside the safe integer range`);
  }
  return parsed;
}

export function permissionMaskArg(value: string): number {
  const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed >= 1 << 14) {
    throw new Error("--permission-mask must be between 1 and 16383");
  }
  return parsed;
}

export function launchModesArg(value: string): number {
  if (value === "curve") return 1;
  if (value === "direct") return 2;
  if (value === "both") return 3;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 3) {
    throw new Error("--launch-modes must be curve, direct, both, 1, 2, or 3");
  }
  return parsed;
}

export type HookTemplateFeeConfig = {
  feeCurrency: `0x${string}`;
  oneTimeFee: bigint;
};

export function hookEntryHook(entry: unknown): `0x${string}` {
  const hook = Array.isArray(entry)
    ? entry[0]
    : (entry as { hook?: unknown }).hook;
  if (typeof hook !== "string" || !isAddress(hook)) {
    throw new Error("HookEntry hook address is missing or invalid");
  }

  return getAddress(hook);
}

export function hookEntryFeeConfig(entry: unknown): HookTemplateFeeConfig | undefined {
  if (Array.isArray(entry)) {
    return entry[20] as HookTemplateFeeConfig | undefined;
  }

  return (entry as { feeConfig?: HookTemplateFeeConfig }).feeConfig;
}
