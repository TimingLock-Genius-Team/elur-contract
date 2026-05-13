export const xlayerAddressEnv = [
  "TEAM_MULTISIG",
  "UNISWAP_V4_POOL_MANAGER",
  "UNISWAP_V4_POSITION_MANAGER",
  "LP_RECIPIENT",
  "MIGRATION_TARGET",
] as const;

export const xlayerMigrationPoolEnv = [
  "XLAYER_V4_HOOKS",
  "XLAYER_V4_POOL_FEE",
  "XLAYER_V4_TICK_SPACING",
  "XLAYER_V4_TICK_LOWER",
  "XLAYER_V4_TICK_UPPER",
  "XLAYER_V4_MIGRATION_LIQUIDITY",
] as const;

export const deploymentProvenanceEnv = ["GIT_COMMIT", "DEPLOYED_AT"] as const;

export function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
