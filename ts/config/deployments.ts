import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isAddress } from "viem";
import { optionalArg } from "../lib/args.js";

export type Deployment = {
  chainId: number;
  commit: string;
  deployedAt: string;
  deployer: `0x${string}`;
  factory: `0x${string}`;
  proxyAdmin?: `0x${string}`;
  factoryImplementation?: `0x${string}`;
  routerImplementation?: `0x${string}`;
  feeRecipient: `0x${string}`;
  uniswapV4PoolManager: `0x${string}`;
  uniswapV4PositionManager: `0x${string}`;
  migrationTarget: `0x${string}`;
  curve: {
    k: string;
    s: string;
    feeBps: number;
    selfDeprecationBps: number;
    maxBuyOkb: string;
  };
  createdTokens: Array<{
    token: `0x${string}`;
    hook: `0x${string}`;
    router: `0x${string}`;
    curveS?: number;
    routerImplementation?: `0x${string}`;
  }>;
};

const deploymentAddressFields = [
  "deployer",
  "factory",
  "feeRecipient",
  "uniswapV4PoolManager",
  "uniswapV4PositionManager",
  "migrationTarget",
] as const;

const createdTokenAddressFields = ["token", "hook", "router"] as const;
const optionalDeploymentAddressFields = ["proxyAdmin", "factoryImplementation", "routerImplementation"] as const;
const optionalCreatedTokenAddressFields = ["routerImplementation"] as const;

function assertDeploymentNetwork(network: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(network)) {
    throw new Error(`Invalid deployment network ${network}`);
  }

  return network;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireAddress(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== "string" || !isAddress(record[field])) {
    throw new Error(`${field} must be a valid address`);
  }
}

function requireOptionalAddress(record: Record<string, unknown>, field: string): void {
  if (record[field] !== undefined && (typeof record[field] !== "string" || !isAddress(record[field]))) {
    throw new Error(`${field} must be a valid address`);
  }
}

function requireString(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== "string" || record[field].length === 0) {
    throw new Error(`${field} is required`);
  }
}

function requireNumber(record: Record<string, unknown>, field: string): void {
  if (!Number.isInteger(record[field])) {
    throw new Error(`${field} must be an integer`);
  }
}

function requireNumericString(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== "string" || !/^\d+$/.test(record[field])) {
    throw new Error(`${field} must be a decimal string`);
  }
}

function parseDeployment(value: unknown): Deployment {
  if (!isRecord(value)) {
    throw new Error("deployment must be an object");
  }
  requireNumber(value, "chainId");
  requireString(value, "commit");
  requireString(value, "deployedAt");
  for (const field of deploymentAddressFields) {
    requireAddress(value, field);
  }
  for (const field of optionalDeploymentAddressFields) {
    requireOptionalAddress(value, field);
  }
  if (!isRecord(value.curve)) {
    throw new Error("curve must be an object");
  }
  requireNumericString(value.curve, "k");
  requireNumericString(value.curve, "s");
  requireNumericString(value.curve, "maxBuyOkb");
  requireNumber(value.curve, "feeBps");
  requireNumber(value.curve, "selfDeprecationBps");
  if (!Array.isArray(value.createdTokens)) {
    throw new Error("createdTokens must be an array");
  }
  value.createdTokens.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`createdTokens[${index}] must be an object`);
    }
    for (const field of createdTokenAddressFields) {
      if (typeof entry[field] !== "string" || !isAddress(entry[field])) {
        throw new Error(`createdTokens[${index}].${field} must be a valid address`);
      }
    }
    for (const field of optionalCreatedTokenAddressFields) {
      if (entry[field] !== undefined && (typeof entry[field] !== "string" || !isAddress(entry[field]))) {
        throw new Error(`createdTokens[${index}].${field} must be a valid address`);
      }
    }
    const curveS = entry.curveS;
    if (curveS !== undefined && (typeof curveS !== "number" || !Number.isInteger(curveS) || curveS < 1 || curveS > 1000)) {
      throw new Error(`createdTokens[${index}].curveS must be an integer between 1 and 1000`);
    }
  });

  return value as Deployment;
}

export function deploymentNetwork(): string {
  return assertDeploymentNetwork((optionalArg("network") ?? process.env.DEPLOYMENT_NETWORK) || "anvil");
}

export function deploymentPath(network = deploymentNetwork()): string {
  return join(process.cwd(), "deployments", assertDeploymentNetwork(network), "latest.json");
}

export function readDeployment(network = deploymentNetwork()): Deployment {
  return parseDeployment(JSON.parse(readFileSync(deploymentPath(network), "utf8")));
}

export function writeDeployment(deployment: Deployment, network = deploymentNetwork()): void {
  const path = deploymentPath(network);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(deployment, null, 2)}\n`);
}

export function latestToken(deployment: Deployment): `0x${string}` {
  const entry = deployment.createdTokens.at(-1);
  if (!entry) {
    throw new Error("No created token found in deployment JSON");
  }
  return entry.token;
}
