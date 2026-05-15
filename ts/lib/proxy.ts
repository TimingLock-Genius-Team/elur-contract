import { getAddress, isAddress, type Hex } from "viem";

export const ERC1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
export const ERC1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

type StorageReader = {
  getStorageAt: (args: { address: `0x${string}`; slot: Hex }) => Promise<Hex | undefined | null>;
};

export function addressFromStorageSlot(value: Hex | undefined | null, label = "storage slot"): `0x${string}` {
  if (!value || value.length !== 66) {
    throw new Error(`${label} is missing or malformed`);
  }

  const address = `0x${value.slice(-40)}` as `0x${string}`;
  if (!isAddress(address)) {
    throw new Error(`${label} does not contain a valid address`);
  }

  return getAddress(address);
}

export async function readProxyAdmin(
  client: StorageReader,
  proxy: `0x${string}`,
): Promise<`0x${string}`> {
  return addressFromStorageSlot(
    await client.getStorageAt({ address: proxy, slot: ERC1967_ADMIN_SLOT }),
    `ERC-1967 admin slot for ${proxy}`,
  );
}

export async function readProxyImplementation(
  client: StorageReader,
  proxy: `0x${string}`,
): Promise<`0x${string}`> {
  return addressFromStorageSlot(
    await client.getStorageAt({ address: proxy, slot: ERC1967_IMPLEMENTATION_SLOT }),
    `ERC-1967 implementation slot for ${proxy}`,
  );
}
