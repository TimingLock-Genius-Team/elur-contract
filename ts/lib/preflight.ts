import { isAddress } from "viem";

export type PreflightResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const requiredAddressEnv = [
  "TEAM_MULTISIG",
  "UNISWAP_V4_POOL_MANAGER",
  "UNISWAP_V4_POSITION_MANAGER",
  "LP_RECIPIENT",
  "MIGRATION_TARGET",
] as const;

function requireString(env: NodeJS.ProcessEnv, name: string, errors: string[]): string | undefined {
  const value = env[name];
  if (!value) {
    errors.push(`${name} is required`);
    return undefined;
  }
  return value;
}

export function validateXLayerPreflight(env: NodeJS.ProcessEnv = process.env): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (env.DEPLOYMENT_NETWORK !== "xlayer") {
    errors.push("DEPLOYMENT_NETWORK must be xlayer");
  }

  requireString(env, "XLAYER_RPC_URL", errors);
  const privateKey = requireString(env, "PRIVATE_KEY", errors);
  if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    errors.push("PRIVATE_KEY must be a 32-byte hex string");
  }
  requireString(env, "GIT_COMMIT", errors);
  const deployedAt = requireString(env, "DEPLOYED_AT", errors);
  if (deployedAt && Number.isNaN(Date.parse(deployedAt))) {
    errors.push("DEPLOYED_AT must be a valid timestamp");
  }

  for (const name of requiredAddressEnv) {
    const value = requireString(env, name, errors);
    if (value && !isAddress(value)) {
      errors.push(`${name} must be a valid address`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
