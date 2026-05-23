import assert from "node:assert/strict";
import test from "node:test";
import { HOOK_PERMISSION_MASK, mineCreate2HookAddress, SELL_TAX_HOOK_FLAGS } from "./v4-hook-miner.js";

test("mineCreate2HookAddress finds a salt whose address has sell-tax hook permission bits", () => {
  const mined = mineCreate2HookAddress({
    deployer: "0x0000000000000000000000000000000000000001",
    initCodeHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
  });

  assert.equal(BigInt(mined.address) & HOOK_PERMISSION_MASK, SELL_TAX_HOOK_FLAGS);
  assert.match(mined.salt, /^0x[0-9a-f]{64}$/);
});
