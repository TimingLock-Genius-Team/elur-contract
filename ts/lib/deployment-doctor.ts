import { isAddress } from "viem";
import type { Deployment } from "../config/deployments.js";

export type DeploymentDoctorResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type DeploymentCodeReader = {
  getChainId?: () => Promise<number>;
  getCode: (args: { address: `0x${string}` }) => Promise<`0x${string}` | undefined | null>;
  getFactoryConfig?: (args: { address: `0x${string}` }) => Promise<{
    feeRecipient: `0x${string}`;
    migrationTarget: `0x${string}`;
  }>;
};

export type DeploymentDoctorOptions = {
  expectedChainId?: number;
  codeReader?: DeploymentCodeReader;
};

const deploymentAddressFields = [
  "deployer",
  "factory",
  "feeRecipient",
  "uniswapV4PoolManager",
  "uniswapV4PositionManager",
  "migrationTarget",
] as const;

const contractAddressFields = [
  "factory",
  "uniswapV4PoolManager",
  "uniswapV4PositionManager",
  "migrationTarget",
] as const;

const createdTokenAddressFields = ["token", "hook", "router"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function requireString(record: Record<string, unknown>, field: string, errors: string[]): void {
  if (!isNonEmptyString(record[field])) {
    errors.push(`${field} is required`);
  }
}

function requireNumericString(record: Record<string, unknown>, field: string, errors: string[]): void {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0 || !/^\d+$/.test(value)) {
    errors.push(`${field} must be a decimal string`);
  }
}

function requireNumber(record: Record<string, unknown>, field: string, errors: string[]): void {
  if (!Number.isInteger(record[field])) {
    errors.push(`${field} must be an integer`);
  }
}

function validAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && isAddress(value);
}

function sameAddress(left: `0x${string}`, right: `0x${string}`): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function requireAddressValue(value: unknown, label: string, errors: string[]): void {
  if (!validAddress(value)) {
    errors.push(`${label} must be a valid address`);
  }
}

function requireAddress(record: Record<string, unknown>, field: string, errors: string[]): void {
  requireAddressValue(record[field], field, errors);
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

async function checkFactoryConfig(
  deployment: Partial<Deployment>,
  codeReader: DeploymentCodeReader,
  errors: string[],
  warnings: string[],
): Promise<void> {
  if (!codeReader.getFactoryConfig || !validAddress(deployment.factory)) {
    return;
  }

  try {
    const config = await codeReader.getFactoryConfig({ address: deployment.factory });
    if (validAddress(deployment.feeRecipient) && !sameAddress(config.feeRecipient, deployment.feeRecipient)) {
      errors.push(
        `Factory feeRecipient ${config.feeRecipient} does not match deployment feeRecipient ${deployment.feeRecipient}`,
      );
    }
    if (validAddress(deployment.migrationTarget) && !sameAddress(config.migrationTarget, deployment.migrationTarget)) {
      errors.push(
        `Factory migrationTarget ${config.migrationTarget} does not match deployment migrationTarget ${deployment.migrationTarget}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Could not check Factory config at ${deployment.factory}: ${message}`);
  }
}

export async function doctorDeployment(
  deployment: unknown,
  options: DeploymentDoctorOptions = {},
): Promise<DeploymentDoctorResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(deployment)) {
    return { ok: false, errors: ["deployment must be an object"], warnings };
  }

  requireNumber(deployment, "chainId", errors);
  requireString(deployment, "commit", errors);
  requireString(deployment, "deployedAt", errors);

  if (isNonEmptyString(deployment.deployedAt) && Number.isNaN(Date.parse(deployment.deployedAt))) {
    errors.push("deployedAt must be a valid timestamp");
  }

  for (const field of deploymentAddressFields) {
    requireAddress(deployment, field, errors);
  }

  const curve = deployment.curve;
  if (!isRecord(curve)) {
    errors.push("curve must be an object");
  } else {
    requireNumericString(curve, "k", errors);
    requireNumericString(curve, "s", errors);
    requireNumericString(curve, "maxBuyOkb", errors);
    requireNumber(curve, "feeBps", errors);
    requireNumber(curve, "selfDeprecationBps", errors);
  }

  if (!Array.isArray(deployment.createdTokens)) {
    errors.push("createdTokens must be an array");
  } else {
    deployment.createdTokens.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push(`createdTokens[${index}] must be an object`);
        return;
      }

      for (const field of createdTokenAddressFields) {
        requireAddressValue(entry[field], `createdTokens[${index}].${field}`, errors);
      }
    });
  }

  if (
    options.expectedChainId !== undefined &&
    Number.isInteger(deployment.chainId) &&
    deployment.chainId !== options.expectedChainId
  ) {
    errors.push(
      `deployment chainId ${deployment.chainId} does not match expected chainId ${options.expectedChainId}`,
    );
  }

  if (options.codeReader?.getChainId && Number.isInteger(deployment.chainId)) {
    try {
      const rpcChainId = await options.codeReader.getChainId();
      if (deployment.chainId !== rpcChainId) {
        errors.push(`deployment chainId ${deployment.chainId} does not match RPC chainId ${rpcChainId}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Could not check RPC chainId: ${message}`);
    }
  }

  const codeReader = options.codeReader;
  if (codeReader) {
    const deploymentWithType = deployment as Partial<Deployment>;
    const codeChecks: Array<() => Promise<void>> = [];

    for (const field of contractAddressFields) {
      const address = deploymentWithType[field];
      if (validAddress(address)) {
        codeChecks.push(() => checkCode(field, address, codeReader, errors, warnings));
      }
    }

    if (Array.isArray(deployment.createdTokens)) {
      deployment.createdTokens.forEach((entry, index) => {
        if (!isRecord(entry)) {
          return;
        }

        for (const field of createdTokenAddressFields) {
          const address = entry[field];
          if (validAddress(address)) {
            codeChecks.push(() => checkCode(`createdTokens[${index}].${field}`, address, codeReader, errors, warnings));
          }
        }
      });
    }

    for (const codeCheck of codeChecks) {
      await codeCheck();
    }

    await checkFactoryConfig(deploymentWithType, codeReader, errors, warnings);
  }

  return { ok: errors.length === 0, errors, warnings };
}
