export const ANVIL_CHAIN_ID = 31337;
export const XLAYER_CHAIN_ID = 196;
export const DEFAULT_ANVIL_RPC_URL = "http://127.0.0.1:8545";

export const okbNativeCurrency = {
  name: "OKB",
  symbol: "OKB",
  decimals: 18,
} as const;

export function rpcEnvKeyForNetwork(network: string): string {
  return `${network.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_RPC_URL`;
}

export function rpcUrlFromEnv(network: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[rpcEnvKeyForNetwork(network)] ?? env.RPC_URL;
}

export function chainConfigFor(network: string, rpcUrl: string) {
  if (network === "anvil") {
    return {
      id: ANVIL_CHAIN_ID,
      name: "Anvil",
      nativeCurrency: okbNativeCurrency,
      rpcUrls: { default: { http: [rpcUrl] } },
    } as const;
  }

  if (network === "xlayer") {
    return {
      id: XLAYER_CHAIN_ID,
      name: "XLayer",
      nativeCurrency: okbNativeCurrency,
      rpcUrls: { default: { http: [rpcUrl] } },
    } as const;
  }

  throw new Error(`Unsupported RPC network ${network}`);
}
