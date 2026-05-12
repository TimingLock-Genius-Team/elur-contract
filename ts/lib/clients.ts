import "dotenv/config";
import { createPublicClient, createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const anvil = {
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545"] } },
} as const;

export function rpcUrl(): string {
  return process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";
}

export function publicClient() {
  return createPublicClient({ chain: anvil, transport: http(rpcUrl()) });
}

export function walletClient() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required");
  }

  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: anvil, transport: http(rpcUrl()) }).extend(publicActions);
}
