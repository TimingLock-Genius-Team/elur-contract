import {
  encodeAbiParameters,
  getAddress,
  isHex,
  keccak256,
  stringToHex,
  type Hex,
} from "viem";

export type MigrationPoolConfig = {
  hooks: `0x${string}`;
  poolFee: number;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  migrationLiquidity: string;
  hookDataHash: `0x${string}`;
};

export type MigrationDataParams = {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  hooks: `0x${string}`;
  poolFee: number;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0Max: bigint;
  amount1Max: bigint;
  deadline: bigint;
  lpRecipient: `0x${string}`;
  hookData: Hex;
};

const INT24_MIN = -(2 ** 23);
const INT24_MAX = 2 ** 23 - 1;
const UINT24_MAX = 2 ** 24 - 1;
const UINT128_MAX = (1n << 128n) - 1n;
const DEFAULT_MIGRATION_LIQUIDITY = "1000000000000000000";

export function hookDataHexFromEnv(env: NodeJS.ProcessEnv = process.env): Hex {
  const value = env.XLAYER_V4_HOOK_DATA;
  if (!value) {
    return "0x";
  }
  return isHex(value) ? value : stringToHex(value);
}

export function hookDataHashFromEnv(env: NodeJS.ProcessEnv = process.env): Hex {
  return keccak256(hookDataHexFromEnv(env));
}

export function migrationPoolConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { requireExplicit?: boolean } = {},
): MigrationPoolConfig {
  const config = {
    hooks: addressEnv(env, "XLAYER_V4_HOOKS", "0x0000000000000000000000000000000000000000", options),
    poolFee: integerEnv(env, "XLAYER_V4_POOL_FEE", 3000, options),
    tickSpacing: integerEnv(env, "XLAYER_V4_TICK_SPACING", 60, options),
    tickLower: integerEnv(env, "XLAYER_V4_TICK_LOWER", -887220, options),
    tickUpper: integerEnv(env, "XLAYER_V4_TICK_UPPER", 887220, options),
    migrationLiquidity: decimalStringEnv(env, "XLAYER_V4_MIGRATION_LIQUIDITY", DEFAULT_MIGRATION_LIQUIDITY, options),
    hookDataHash: hookDataHashFromEnv(env),
  };
  validateMigrationPoolConfig(config);
  return config;
}

export function validateMigrationPoolConfig(config: MigrationPoolConfig): void {
  if (config.poolFee <= 0 || config.poolFee > UINT24_MAX) {
    throw new Error("migrationPool.poolFee must be a uint24 greater than zero");
  }
  if (config.tickSpacing <= 0 || !isInt24(config.tickSpacing)) {
    throw new Error("migrationPool.tickSpacing must be a positive int24");
  }
  if (!isInt24(config.tickLower) || !isInt24(config.tickUpper)) {
    throw new Error("migrationPool ticks must fit int24");
  }
  if (config.tickLower >= config.tickUpper) {
    throw new Error("migrationPool.tickLower must be less than tickUpper");
  }
  if (config.tickLower % config.tickSpacing !== 0 || config.tickUpper % config.tickSpacing !== 0) {
    throw new Error("migrationPool ticks must align with tickSpacing");
  }
  if (!/^[1-9]\d*$/.test(config.migrationLiquidity)) {
    throw new Error("migrationPool.migrationLiquidity must be a positive decimal string");
  }
  if (BigInt(config.migrationLiquidity) > UINT128_MAX) {
    throw new Error("migrationPool.migrationLiquidity must fit uint128");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(config.hookDataHash)) {
    throw new Error("migrationPool.hookDataHash must be a 32-byte hex string");
  }
}

export function encodeMigrationDataParams(params: MigrationDataParams): Hex {
  return encodeAbiParameters(
    [{
      type: "tuple",
      components: [
        { name: "currency0", type: "address" },
        { name: "currency1", type: "address" },
        { name: "hooks", type: "address" },
        { name: "poolFee", type: "uint24" },
        { name: "tickSpacing", type: "int24" },
        { name: "tickLower", type: "int24" },
        { name: "tickUpper", type: "int24" },
        { name: "liquidity", type: "uint128" },
        { name: "amount0Max", type: "uint256" },
        { name: "amount1Max", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "lpRecipient", type: "address" },
        { name: "hookData", type: "bytes" },
      ],
    }],
    [params],
  );
}

function envValue(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
  options: { requireExplicit?: boolean },
): string {
  const value = env[name];
  if (!value) {
    if (options.requireExplicit) {
      throw new Error(`${name} is required`);
    }
    return fallback;
  }
  return value;
}

function addressEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: `0x${string}`,
  options: { requireExplicit?: boolean },
): `0x${string}` {
  return getAddress(envValue(env, name, fallback, options));
}

function integerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  options: { requireExplicit?: boolean },
): number {
  const value = envValue(env, name, String(fallback), options);
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

function decimalStringEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
  options: { requireExplicit?: boolean },
): string {
  return envValue(env, name, fallback, options);
}

function isInt24(value: number): boolean {
  return Number.isInteger(value) && value >= INT24_MIN && value <= INT24_MAX;
}
