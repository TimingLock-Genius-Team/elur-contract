export const xlayerAddressEnv = [
  "TEAM_MULTISIG",
  "UNISWAP_V4_POOL_MANAGER",
  "UNISWAP_V4_POSITION_MANAGER",
  "LP_RECIPIENT",
  "MIGRATION_TARGET",
] as const;

export const deploymentProvenanceEnv = ["GIT_COMMIT", "DEPLOYED_AT"] as const;

export function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
