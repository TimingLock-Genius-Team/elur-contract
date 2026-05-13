import { strict as assert } from "node:assert";
import test from "node:test";
import { decodeAbiParameters } from "viem";
import {
  encodeMigrationDataParams,
  hookDataHashFromEnv,
  migrationPoolConfigFromEnv,
  validateMigrationPoolConfig,
} from "./migration-data.js";

test("migrationPoolConfigFromEnv parses and validates allowlist parameters", () => {
  const config = migrationPoolConfigFromEnv({
    XLAYER_V4_HOOKS: "0x0000000000000000000000000000000000000001",
    XLAYER_V4_POOL_FEE: "500",
    XLAYER_V4_TICK_SPACING: "10",
    XLAYER_V4_TICK_LOWER: "-100",
    XLAYER_V4_TICK_UPPER: "100",
    XLAYER_V4_MIGRATION_LIQUIDITY: "2000000000000000000",
    XLAYER_V4_HOOK_DATA: "hook-data",
  });

  assert.deepEqual(config, {
    hooks: "0x0000000000000000000000000000000000000001",
    poolFee: 500,
    tickSpacing: 10,
    tickLower: -100,
    tickUpper: 100,
    migrationLiquidity: "2000000000000000000",
    hookDataHash: hookDataHashFromEnv({ XLAYER_V4_HOOK_DATA: "hook-data" }),
  });
});

test("validateMigrationPoolConfig rejects parameters that cannot pass MigrationData", () => {
  const base = migrationPoolConfigFromEnv({});

  assert.throws(
    () => validateMigrationPoolConfig({ ...base, poolFee: 0 }),
    /poolFee must be a uint24 greater than zero/,
  );
  assert.throws(
    () => validateMigrationPoolConfig({ ...base, tickSpacing: 0 }),
    /tickSpacing must be a positive int24/,
  );
  assert.throws(
    () => validateMigrationPoolConfig({ ...base, tickLower: 100, tickUpper: 100 }),
    /tickLower must be less than tickUpper/,
  );
  assert.throws(
    () => validateMigrationPoolConfig({ ...base, tickLower: -61 }),
    /ticks must align with tickSpacing/,
  );
  assert.throws(
    () => validateMigrationPoolConfig({ ...base, migrationLiquidity: "0" }),
    /migrationLiquidity must be a positive decimal string/,
  );
  assert.throws(
    () => validateMigrationPoolConfig({ ...base, migrationLiquidity: (1n << 128n).toString() }),
    /migrationLiquidity must fit uint128/,
  );
});

test("encodeMigrationDataParams ABI-encodes the Solidity MigrationData.Params tuple", () => {
  const encoded = encodeMigrationDataParams({
    currency0: "0x0000000000000000000000000000000000000000",
    currency1: "0x0000000000000000000000000000000000000001",
    hooks: "0x0000000000000000000000000000000000000002",
    poolFee: 3000,
    tickSpacing: 60,
    tickLower: -887220,
    tickUpper: 887220,
    liquidity: 1n,
    amount0Max: 2n,
    amount1Max: 3n,
    deadline: 4n,
    lpRecipient: "0x000000000000000000000000000000000000dEaD",
    hookData: "0x1234",
  });
  const [decoded] = decodeAbiParameters([{
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
  }], encoded);

  assert.equal(decoded.poolFee, 3000);
  assert.equal(decoded.tickLower, -887220);
  assert.equal(decoded.amount1Max, 3n);
  assert.equal(decoded.hookData, "0x1234");
});
