import { strict as assert } from "node:assert";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  chunkAccounts,
  excludeOwnerWallet,
  parseHashKeyTestWallets,
  selectHashKeyTestSmokeTargets,
} from "./hashkeytest-smoke-accounts.js";

const ownerPrivateKey = `0x${"1".repeat(64)}` as `0x${string}`;
const traderPrivateKey = `0x${"2".repeat(64)}` as `0x${string}`;
const ownerAddress = privateKeyToAccount(ownerPrivateKey).address;
const traderAddress = privateKeyToAccount(traderPrivateKey).address;

test("parseHashKeyTestWallets parses tab or whitespace separated rows", () => {
  const accounts = parseHashKeyTestWallets(`
    # address privateKey label allocation
    ${ownerAddress}\t${ownerPrivateKey}\tOwner\t0
    ${traderAddress} ${traderPrivateKey} Trader 0
  `);

  assert.deepEqual(accounts.map(({ address, label, allocation }) => ({ address, label, allocation })), [
    { address: ownerAddress, label: "Owner", allocation: "0" },
    { address: traderAddress, label: "Trader", allocation: "0" },
  ]);
});

test("parseHashKeyTestWallets rejects mismatched private keys", () => {
  assert.throws(
    () => parseHashKeyTestWallets(`${ownerAddress} ${traderPrivateKey} Bad 0`),
    /privateKey derives/,
  );
});

test("excludeOwnerWallet removes the owner account case-insensitively", () => {
  const accounts = parseHashKeyTestWallets(`
    ${ownerAddress} ${ownerPrivateKey} Owner 0
    ${traderAddress} ${traderPrivateKey} Trader 0
  `);

  assert.deepEqual(excludeOwnerWallet(accounts, ownerAddress.toLowerCase() as `0x${string}`).map((account) => account.address), [traderAddress]);
});

test("selectHashKeyTestSmokeTargets rejects empty target sets after owner exclusion", () => {
  const accounts = parseHashKeyTestWallets(`${ownerAddress} ${ownerPrivateKey} Owner 0`);

  assert.throws(
    () => selectHashKeyTestSmokeTargets(accounts, ownerAddress, Number.MAX_SAFE_INTEGER),
    /no hashkeytest smoke target wallets remain after excluding owner/,
  );
});

test("chunkAccounts chunks by positive concurrency", () => {
  assert.deepEqual(chunkAccounts([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.throws(() => chunkAccounts([1], 0), /concurrency must be a positive integer/);
});
