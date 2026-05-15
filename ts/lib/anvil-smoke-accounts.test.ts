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

test("deriveAnvilSmokeAccounts defaults to standard Anvil accounts", () => {
  const accounts = deriveAnvilSmokeAccounts(undefined);

  assert.equal(accounts.length, 10);
  assert.deepEqual(accounts.map((account) => account.address), [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
    "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
    "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
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
