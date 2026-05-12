import "dotenv/config";
import { createPublicClient, createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deploymentNetwork } from "./deployments.js";

export const anvil = {
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545"] } },
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function xlayerChainId(): number {
  return Number(process.env.XLAYER_CHAIN_ID ?? "196");
}

export function rpcUrl(network = deploymentNetwork()): string {
  if (network === "anvil") {
    return process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";
  }
  if (network === "xlayer") {
    return requiredEnv("XLAYER_RPC_URL");
  }

  throw new Error(`Unsupported RPC network ${network}`);
}

export function chainConfig(network = deploymentNetwork()) {
  if (network === "anvil") {
    return anvil;
  }
  if (network === "xlayer") {
    return {
      id: xlayerChainId(),
      name: "XLayer",
      nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl(network)] } },
    } as const;
  }

  throw new Error(`Unsupported RPC network ${network}`);
}

export function publicClient() {
  return createPublicClient({ chain: chainConfig(), transport: http(rpcUrl()) });
}

export function walletClient() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required");
  }

  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: chainConfig(), transport: http(rpcUrl()) }).extend(publicActions);
}
