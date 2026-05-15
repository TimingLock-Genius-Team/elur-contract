import { privateKeyToAccount } from "viem/accounts";

export type HashKeyTestSmokeAccount = {
  address: `0x${string}`;
  privateKey: `0x${string}`;
  label: string;
  allocation: string;
};

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const privateKeyPattern = /^0x[0-9a-fA-F]{64}$/;

export function parseHashKeyTestWallets(input: string): HashKeyTestSmokeAccount[] {
  const accounts = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line, index) => {
      const [address, privateKey, label, allocation = "0"] = line.split(/\s+/);
      const row = index + 1;

      if (!addressPattern.test(address ?? "")) {
        throw new Error(`wallet row ${row} address must be an address`);
      }
      if (!privateKeyPattern.test(privateKey ?? "")) {
        throw new Error(`wallet row ${row} privateKey must be a 32-byte hex string`);
      }
      if (!label) {
        throw new Error(`wallet row ${row} label is required`);
      }

      const derived = privateKeyToAccount(privateKey as `0x${string}`).address;
      if (derived.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`wallet row ${row} privateKey derives ${derived}, expected ${address}`);
      }

      return {
        address: address as `0x${string}`,
        privateKey: privateKey as `0x${string}`,
        label,
        allocation,
      };
    });

  if (accounts.length === 0) {
    throw new Error("HASHKEYTEST_TEST_WALLETS_FILE contains no wallets");
  }

  return accounts;
}

export function excludeOwnerWallet(
  accounts: HashKeyTestSmokeAccount[],
  ownerAddress: `0x${string}`,
): HashKeyTestSmokeAccount[] {
  return accounts.filter((account) => account.address.toLowerCase() !== ownerAddress.toLowerCase());
}

export function selectHashKeyTestSmokeTargets(
  accounts: HashKeyTestSmokeAccount[],
  ownerAddress: `0x${string}`,
  limit: number,
): HashKeyTestSmokeAccount[] {
  const selected = excludeOwnerWallet(accounts, ownerAddress).slice(0, limit);
  if (selected.length === 0) {
    throw new Error("no hashkeytest smoke target wallets remain after excluding owner");
  }

  return selected;
}

export function chunkAccounts<T>(accounts: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("concurrency must be a positive integer");
  }

  const chunks: T[][] = [];
  for (let i = 0; i < accounts.length; i += size) {
    chunks.push(accounts.slice(i, i + size));
  }
  return chunks;
}
