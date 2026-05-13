import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isAddress } from "viem";
import { deploymentNetwork } from "./deployments.js";

export type MigrationTargetDeploymentRecord = {
  chainId: number;
  commit: string;
  deployedAt: string;
  deployer: `0x${string}`;
  migrationTarget: `0x${string}`;
  transactionHash: `0x${string}`;
  uniswapV4PoolManager: `0x${string}`;
  uniswapV4PositionManager: `0x${string}`;
  lpRecipient: `0x${string}`;
};

const addressFields = [
  "deployer",
  "migrationTarget",
  "uniswapV4PoolManager",
  "uniswapV4PositionManager",
  "lpRecipient",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireAddress(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== "string" || !isAddress(record[field])) {
    throw new Error(`${field} must be a valid address`);
  }
}

function requireString(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== "string" || record[field].length === 0) {
    throw new Error(`${field} is required`);
  }
}

function parseMigrationTargetDeployment(value: unknown): MigrationTargetDeploymentRecord {
  if (!isRecord(value)) {
    throw new Error("migration target deployment must be an object");
  }
  if (!Number.isInteger(value.chainId)) {
    throw new Error("chainId must be an integer");
  }
  requireString(value, "commit");
  requireString(value, "deployedAt");
  for (const field of addressFields) {
    requireAddress(value, field);
  }
  if (typeof value.transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value.transactionHash)) {
    throw new Error("transactionHash must be a 32-byte hex string");
  }

  return value as MigrationTargetDeploymentRecord;
}

function assertDeploymentNetwork(network: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(network)) {
    throw new Error(`Invalid deployment network ${network}`);
  }

  return network;
}

export function migrationTargetDeploymentPath(network = deploymentNetwork()): string {
  return join(process.cwd(), "deployments", assertDeploymentNetwork(network), "uniswap-v4-mint-position-target.json");
}

export function readMigrationTargetDeployment(network = deploymentNetwork()): MigrationTargetDeploymentRecord {
  return parseMigrationTargetDeployment(JSON.parse(readFileSync(migrationTargetDeploymentPath(network), "utf8")));
}

export function writeMigrationTargetDeployment(
  deployment: MigrationTargetDeploymentRecord,
  network = deploymentNetwork(),
): void {
  const path = migrationTargetDeploymentPath(network);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(deployment, null, 2)}\n`);
}
