import { abiOf } from "./artifacts.js";
import { latestToken, readDeployment } from "./deployments.js";
import { getArg } from "./args.js";
import { publicClient } from "./clients.js";

export const factoryAbi = abiOf("SatpadFactory.sol/SatpadFactory.json");
export const hookAbi = abiOf("SatpadHook.sol/SatpadHook.json");
export const routerAbi = abiOf("SatpadRouter.sol/SatpadRouter.json");
export const tokenAbi = abiOf("SatpadToken.sol/SatpadToken.json");

export type TokenInfoTuple = readonly [
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  string,
  string,
];

type TokenInfoObject = {
  token: `0x${string}`;
  hook: `0x${string}`;
  router: `0x${string}`;
  creator: `0x${string}`;
  metadataURI: string;
  socialURI: string;
};

export function normalizeTokenInfo(info: unknown): TokenInfoObject {
  if (Array.isArray(info)) {
    const tuple = info as unknown as TokenInfoTuple;
    return {
      token: tuple[0],
      hook: tuple[1],
      router: tuple[2],
      creator: tuple[3],
      metadataURI: tuple[4],
      socialURI: tuple[5],
    };
  }

  return info as TokenInfoObject;
}

export async function resolveTokenInfo() {
  const deployment = readDeployment();
  const token = getArg("token", latestToken(deployment)) as `0x${string}`;
  const client = publicClient();
  const info = normalizeTokenInfo(await client.readContract({
    address: deployment.factory,
    abi: factoryAbi,
    functionName: "getTokenInfo",
    args: [token],
  }));

  return {
    deployment,
    token: info.token,
    hook: info.hook,
    router: info.router,
    creator: info.creator,
    metadataURI: info.metadataURI,
    socialURI: info.socialURI,
  };
}
