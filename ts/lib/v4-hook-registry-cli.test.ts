import { strict as assert } from "node:assert";
import test from "node:test";
import * as registryCli from "./v4-hook-registry-cli.js";

test("hookEntryFeeConfig reads feeConfig from HookEntry tuple index 20", () => {
  const feeConfig = {
    feeCurrency: "0x0000000000000000000000000000000000000000",
    oneTimeFee: 123n,
  };
  const submittedAt = 456n;
  const tupleEntry = [
    "0x0000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000002",
    "0x0000000000000000000000000000000000000003",
    31337n,
    0xc8,
    4,
    "ipfs://metadata",
    `0x${"0".repeat(64)}`,
    `0x${"0".repeat(64)}`,
    `0x${"0".repeat(64)}`,
    `0x${"0".repeat(64)}`,
    `0x${"0".repeat(64)}`,
    3_000,
    60,
    0n,
    `0x${"0".repeat(64)}`,
    "",
    `0x${"0".repeat(64)}`,
    "",
    3,
    feeConfig,
    submittedAt,
  ] as const;
  const hookEntryFeeConfig = (registryCli as Record<string, unknown>).hookEntryFeeConfig as
    | ((entry: unknown) => unknown)
    | undefined;
  const hookEntryHook = (registryCli as Record<string, unknown>).hookEntryHook as ((entry: unknown) => unknown) | undefined;

  if (typeof hookEntryFeeConfig !== "function") {
    throw new Error("hookEntryFeeConfig export missing");
  }
  if (typeof hookEntryHook !== "function") {
    throw new Error("hookEntryHook export missing");
  }
  assert.deepEqual(hookEntryFeeConfig(tupleEntry), feeConfig);
  assert.notDeepEqual(hookEntryFeeConfig(tupleEntry), submittedAt);
  assert.equal(hookEntryHook(tupleEntry), "0x0000000000000000000000000000000000000001");
});
