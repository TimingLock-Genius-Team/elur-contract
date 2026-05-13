import { strict as assert } from "node:assert";
import test from "node:test";
import {
  accountsNeedingFunding,
  deriveAnvilSmokeAccounts,
  parseHexList,
} from "./anvil-smoke-accounts.js";

const account0PrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account1PrivateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

test("parseHexList accepts comma whitespace and newline separated values", () => {
  assert.deepEqual(
    parseHexList(` ${account0PrivateKey},\n${account1PrivateKey} `, "ANVIL_PRIVATE_KEYS"),
    [account0PrivateKey, account1PrivateKey],
  );
});

test("parseHexList rejects malformed private keys", () => {
  assert.throws(
    () => parseHexList("0x1234", "ANVIL_PRIVATE_KEYS"),
    /ANVIL_PRIVATE_KEYS entry 1 must be a 32-byte hex string/,
  );
});

test("deriveAnvilSmokeAccounts derives and verifies expected addresses", () => {
  const accounts = deriveAnvilSmokeAccounts(
    `${account0PrivateKey},${account1PrivateKey}`,
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  );

  assert.deepEqual(accounts.map((account) => account.address), [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  ]);
});

test("deriveAnvilSmokeAccounts rejects expected address mismatches", () => {
  assert.throws(
    () => deriveAnvilSmokeAccounts(account0PrivateKey, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
    /expected 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 but private key derives/,
  );
});

test("accountsNeedingFunding returns accounts below the minimum balance", () => {
  const accounts = deriveAnvilSmokeAccounts(`${account0PrivateKey},${account1PrivateKey}`);

  assert.deepEqual(
    accountsNeedingFunding([
      { account: accounts[0], balance: 2n },
      { account: accounts[1], balance: 0n },
    ], 1n).map((entry) => entry.account.address),
    ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"],
  );
});
