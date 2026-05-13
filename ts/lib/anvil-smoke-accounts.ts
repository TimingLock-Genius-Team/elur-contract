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
  const privateKeys = parseHexList(privateKeysInput, "ANVIL_PRIVATE_KEYS");
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
