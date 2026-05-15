import "dotenv/config";
import { createPublicClient, createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_ANVIL_RPC_URL, chainConfigFor, rpcEnvKeyForNetwork, rpcUrlFromEnv } from "../config/chains.js";
import { requiredEnv } from "../config/env.js";
import { deploymentNetwork } from "../config/deployments.js";

export function rpcUrl(network = deploymentNetwork()): string {
  if (network === "anvil") {
    return rpcUrlFromEnv(network) ?? DEFAULT_ANVIL_RPC_URL;
  }
  if (network === "xlayer") {
    return rpcUrlFromEnv(network) ?? requiredEnv(process.env, "XLAYER_RPC_URL");
  }
  if (network === "hashkeytest") {
    return rpcUrlFromEnv(network) ?? requiredEnv(process.env, rpcEnvKeyForNetwork(network));
  }

  throw new Error(`Unsupported RPC network ${network}`);
}

export function chainConfig(network = deploymentNetwork()) {
  return chainConfigFor(network, rpcUrl(network));
}

export function publicClient() {
  return createPublicClient({ chain: chainConfig(), transport: http(rpcUrl()) });
}

export function walletClient() {
  const network = deploymentNetwork();
  const privateKey = (
    network === "hashkeytest"
      ? process.env.HASHKEYTEST_OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY
      : process.env.PRIVATE_KEY
  ) as `0x${string}` | undefined;
  if (!privateKey) {
    throw new Error(network === "hashkeytest" ? "PRIVATE_KEY or HASHKEYTEST_OWNER_PRIVATE_KEY is required" : "PRIVATE_KEY is required");
  }

  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: chainConfig(network), transport: http(rpcUrl(network)) }).extend(publicActions);
}
