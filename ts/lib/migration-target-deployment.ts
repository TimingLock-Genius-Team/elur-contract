import { isAddress } from "viem";
import {
  migrationTargetDeploymentPath,
  readMigrationTargetDeployment,
  writeMigrationTargetDeployment,
  type MigrationTargetDeploymentRecord,
} from "../config/migration-target-deployments.js";
import type { DeploymentCodeReader, DeploymentDoctorResult } from "./deployment-doctor.js";

export {
  migrationTargetDeploymentPath,
  readMigrationTargetDeployment,
  writeMigrationTargetDeployment,
  type MigrationTargetDeploymentRecord,
};

export type MigrationTargetDeploymentDoctorOptions = {
  expectedChainId?: number;
  codeReader?: DeploymentCodeReader;
};

const addressFields = [
  "deployer",
  "migrationTarget",
  "uniswapV4PoolManager",
  "uniswapV4PositionManager",
  "lpRecipient",
] as const;

const codeAddressFields = ["migrationTarget", "uniswapV4PoolManager", "uniswapV4PositionManager"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && isAddress(value);
}

function sameAddress(left: `0x${string}`, right: `0x${string}`): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function requireString(record: Record<string, unknown>, field: string, errors: string[]): void {
  if (!isNonEmptyString(record[field])) {
    errors.push(`${field} is required`);
  }
}

function requireAddress(record: Record<string, unknown>, field: string, errors: string[]): void {
  if (!validAddress(record[field])) {
    errors.push(`${field} must be a valid address`);
  }
}

async function checkCode(
  label: string,
  address: `0x${string}`,
  codeReader: DeploymentCodeReader,
  errors: string[],
  warnings: string[],
): Promise<void> {
  try {
    const code = await codeReader.getCode({ address });
    if (!code || code === "0x") {
      errors.push(`${address} has no code for ${label}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Could not check code for ${label} at ${address}: ${message}`);
  }
}

export async function doctorMigrationTargetDeployment(
  deployment: unknown,
  options: MigrationTargetDeploymentDoctorOptions = {},
): Promise<DeploymentDoctorResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(deployment)) {
    return { ok: false, errors: ["migration target deployment must be an object"], warnings };
  }

  if (!Number.isInteger(deployment.chainId)) {
    errors.push("chainId must be an integer");
  }
  requireString(deployment, "commit", errors);
  requireString(deployment, "deployedAt", errors);
  if (isNonEmptyString(deployment.deployedAt) && Number.isNaN(Date.parse(deployment.deployedAt))) {
    errors.push("deployedAt must be a valid timestamp");
  }
  if (typeof deployment.transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(deployment.transactionHash)) {
    errors.push("transactionHash must be a 32-byte hex string");
  }

  for (const field of addressFields) {
    requireAddress(deployment, field, errors);
  }

  if (
    validAddress(deployment.deployer) &&
    validAddress(deployment.lpRecipient) &&
    sameAddress(deployment.lpRecipient, deployment.deployer)
  ) {
    errors.push("lpRecipient must not equal deployer");
  }

  if (
    options.expectedChainId !== undefined &&
    Number.isInteger(deployment.chainId) &&
    deployment.chainId !== options.expectedChainId
  ) {
    errors.push(
      `migration target deployment chainId ${deployment.chainId} does not match expected chainId ${options.expectedChainId}`,
    );
  }

  const codeReader = options.codeReader;
  if (codeReader?.getChainId && Number.isInteger(deployment.chainId)) {
    try {
      const rpcChainId = await codeReader.getChainId();
      if (deployment.chainId !== rpcChainId) {
        errors.push(`migration target deployment chainId ${deployment.chainId} does not match RPC chainId ${rpcChainId}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Could not check RPC chainId: ${message}`);
    }
  }

  if (codeReader) {
    for (const field of codeAddressFields) {
      const address = deployment[field];
      if (validAddress(address)) {
        await checkCode(field, address, codeReader, errors, warnings);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
