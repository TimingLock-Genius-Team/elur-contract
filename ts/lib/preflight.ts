import { isAddress } from "viem";
import { XLAYER_CHAIN_ID, rpcUrlFromEnv } from "../config/chains.js";
import { deploymentProvenanceEnv, xlayerAddressEnv, xlayerMigrationPoolEnv } from "../config/env.js";
import { migrationPoolConfigFromEnv } from "./migration-data.js";

export type PreflightResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

function requireString(env: NodeJS.ProcessEnv, name: string, errors: string[]): string | undefined {
  const value = env[name];
  if (!value) {
    errors.push(`${name} is required`);
    return undefined;
  }
  return value;
}

function validateXLayerNetworkEnv(env: NodeJS.ProcessEnv, errors: string[]): void {
  if (env.DEPLOYMENT_NETWORK !== "xlayer") {
    errors.push("DEPLOYMENT_NETWORK must be xlayer");
  }

  if (!rpcUrlFromEnv("xlayer", env)) {
    errors.push("XLAYER_RPC_URL is required");
  }
  if (env.XLAYER_CHAIN_ID && env.XLAYER_CHAIN_ID !== String(XLAYER_CHAIN_ID)) {
    errors.push(`XLAYER_CHAIN_ID must be ${XLAYER_CHAIN_ID} when set`);
  }
}

function validateXLayerAddressEnv(env: NodeJS.ProcessEnv, errors: string[]): void {
  for (const name of xlayerAddressEnv) {
    const value = requireString(env, name, errors);
    if (value && !isAddress(value)) {
      errors.push(`${name} must be a valid address`);
    }
  }
}

function validateXLayerMigrationPoolEnv(env: NodeJS.ProcessEnv, errors: string[]): void {
  const missingBefore = errors.length;
  for (const name of xlayerMigrationPoolEnv) {
    requireString(env, name, errors);
  }
  if (errors.length !== missingBefore) {
    return;
  }

  try {
    migrationPoolConfigFromEnv(env, { requireExplicit: true });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

export function validateXLayerReadinessPreflight(env: NodeJS.ProcessEnv = process.env): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  validateXLayerNetworkEnv(env, errors);
  validateXLayerAddressEnv(env, errors);
  validateXLayerMigrationPoolEnv(env, errors);

  return { ok: errors.length === 0, errors, warnings };
}

export function validateXLayerPreflight(env: NodeJS.ProcessEnv = process.env): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  validateXLayerNetworkEnv(env, errors);
  const privateKey = requireString(env, "PRIVATE_KEY", errors);
  if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    errors.push("PRIVATE_KEY must be a 32-byte hex string");
  }
  requireString(env, deploymentProvenanceEnv[0], errors);
  const deployedAt = requireString(env, deploymentProvenanceEnv[1], errors);
  if (deployedAt && Number.isNaN(Date.parse(deployedAt))) {
    errors.push("DEPLOYED_AT must be a valid timestamp");
  }
  validateXLayerAddressEnv(env, errors);
  validateXLayerMigrationPoolEnv(env, errors);

  return { ok: errors.length === 0, errors, warnings };
}
