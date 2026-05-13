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
  migrationPool: {
    hooks: `0x${string}`;
    poolFee: number;
    tickSpacing: number;
    tickLower: number;
    tickUpper: number;
    migrationLiquidity: string;
    hookDataHash: `0x${string}`;
  };
};

const addressFields = [
  "deployer",
  "migrationTarget",
  "uniswapV4PoolManager",
  "uniswapV4PositionManager",
  "lpRecipient",
] as const;
const INT24_MIN = -(2 ** 23);
const INT24_MAX = 2 ** 23 - 1;
const UINT24_MAX = 2 ** 24 - 1;
const UINT128_MAX = (1n << 128n) - 1n;

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

function requireInteger(record: Record<string, unknown>, field: string): void {
  if (!Number.isInteger(record[field])) {
    throw new Error(`${field} must be an integer`);
  }
}

function requirePositiveDecimalString(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== "string" || !/^[1-9]\d*$/.test(record[field])) {
    throw new Error(`${field} must be a positive decimal string`);
  }
  if (BigInt(record[field]) > UINT128_MAX) {
    throw new Error(`${field} must fit uint128`);
  }
}

function validateMigrationPool(record: Record<string, unknown>): void {
  if ((record.poolFee as number) <= 0 || (record.poolFee as number) > UINT24_MAX) {
    throw new Error("migrationPool.poolFee must be a uint24 greater than zero");
  }
  if ((record.tickSpacing as number) <= 0 || !isInt24(record.tickSpacing as number)) {
    throw new Error("migrationPool.tickSpacing must be a positive int24");
  }
  if (!isInt24(record.tickLower as number) || !isInt24(record.tickUpper as number)) {
    throw new Error("migrationPool ticks must fit int24");
  }
  if ((record.tickLower as number) >= (record.tickUpper as number)) {
    throw new Error("migrationPool.tickLower must be less than tickUpper");
  }
  if ((record.tickLower as number) % (record.tickSpacing as number) !== 0 || (record.tickUpper as number) % (record.tickSpacing as number) !== 0) {
    throw new Error("migrationPool ticks must align with tickSpacing");
  }
  try {
    requirePositiveDecimalString(record, "migrationLiquidity");
  } catch (error) {
    throw new Error(`migrationPool.${error instanceof Error ? error.message : String(error)}`);
  }
}

function isInt24(value: number): boolean {
  return Number.isInteger(value) && value >= INT24_MIN && value <= INT24_MAX;
}

function parseMigrationTargetDeployment(value: unknown): MigrationTargetDeploymentRecord {
  if (!isRecord(value)) {
    throw new Error("migration target deployment must be an object");
  }
  requireInteger(value, "chainId");
  requireString(value, "commit");
  requireString(value, "deployedAt");
  for (const field of addressFields) {
    requireAddress(value, field);
  }
  if (typeof value.transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value.transactionHash)) {
    throw new Error("transactionHash must be a 32-byte hex string");
  }
  if (!isRecord(value.migrationPool)) {
    throw new Error("migrationPool must be an object");
  }
  requireAddress(value.migrationPool, "hooks");
  requireInteger(value.migrationPool, "poolFee");
  requireInteger(value.migrationPool, "tickSpacing");
  requireInteger(value.migrationPool, "tickLower");
  requireInteger(value.migrationPool, "tickUpper");
  try {
    requirePositiveDecimalString(value.migrationPool, "migrationLiquidity");
  } catch (error) {
    throw new Error(`migrationPool.${error instanceof Error ? error.message : String(error)}`);
  }
  if (
    typeof value.migrationPool.hookDataHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(value.migrationPool.hookDataHash)
  ) {
    throw new Error("migrationPool.hookDataHash must be a 32-byte hex string");
  }
  validateMigrationPool(value.migrationPool);

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
