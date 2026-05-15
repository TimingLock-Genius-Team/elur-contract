import { privateKeyToAccount } from "viem/accounts";

export type AnvilSmokeAccount = {
  index: number;
  privateKey: `0x${string}`;
  address: `0x${string}`;
};

export type AnvilSmokeAccountBalance = {
  account: AnvilSmokeAccount;
  balance: bigint;
};

const hex32Pattern = /^0x[0-9a-fA-F]{64}$/;
const addressPattern = /^0x[0-9a-fA-F]{40}$/;

export const defaultAnvilPrivateKeys: `0x${string}`[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
];

export function parseHexList(value: string | undefined, name: string): `0x${string}`[] {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  const entries = value.split(/[\s,]+/).filter(Boolean);
  if (entries.length === 0) {
    throw new Error(`${name} is required`);
  }

  return entries.map((entry, index) => {
    if (!hex32Pattern.test(entry)) {
      throw new Error(`${name} entry ${index + 1} must be a 32-byte hex string`);
    }
    return entry as `0x${string}`;
  });
}

export function parseAddressList(value: string | undefined, name: string): `0x${string}`[] | undefined {
  if (!value) {
    return undefined;
  }

  const entries = value.split(/[\s,]+/).filter(Boolean);
  return entries.map((entry, index) => {
    if (!addressPattern.test(entry)) {
      throw new Error(`${name} entry ${index + 1} must be an address`);
    }
    return entry as `0x${string}`;
  });
}

export function deriveAnvilSmokeAccounts(
  privateKeysInput: string | undefined,
  expectedAccountsInput?: string,
): AnvilSmokeAccount[] {
  const privateKeys = privateKeysInput
    ? parseHexList(privateKeysInput, "ANVIL_PRIVATE_KEYS")
    : defaultAnvilPrivateKeys;
  const expectedAccounts = parseAddressList(expectedAccountsInput, "ANVIL_EXPECTED_ACCOUNTS");

  if (expectedAccounts && expectedAccounts.length !== privateKeys.length) {
    throw new Error("ANVIL_EXPECTED_ACCOUNTS must contain the same number of entries as ANVIL_PRIVATE_KEYS");
  }

  return privateKeys.map((privateKey, index) => {
    const address = privateKeyToAccount(privateKey).address;
    const expectedAddress = expectedAccounts?.[index];

    if (expectedAddress && expectedAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`account ${index} expected ${expectedAddress} but private key derives ${address}`);
    }

    return { index, privateKey, address };
  });
}

export function accountsNeedingFunding(
  balances: AnvilSmokeAccountBalance[],
  minBalance: bigint,
): AnvilSmokeAccountBalance[] {
  return balances.filter(({ balance }) => balance < minBalance);
}
