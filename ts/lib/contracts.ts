import { decodeEventLog, isAddress, type Abi } from "viem";
import { abiOf } from "./artifacts.js";
import { artifacts } from "../config/artifacts.js";
import { latestToken, readDeployment } from "../config/deployments.js";
import { getArg } from "./args.js";
import { publicClient } from "./clients.js";

export const factoryAbi = abiOf(artifacts.factory);
export const hookAbi = abiOf("EulrHook.sol/EulrHook.json");
export const routerAbi = abiOf("EulrRouter.sol/EulrRouter.json");
export const tokenAbi = abiOf("EulrToken.sol/EulrToken.json");

type FactoryRouterImplementationReader = {
  readContract: (args: { address: `0x${string}`; abi: Abi; functionName: "routerImplementation" }) => Promise<unknown>;
};

type FactoryHookImplementationReader = {
  readContract: (args: { address: `0x${string}`; abi: Abi; functionName: "hookImplementation" }) => Promise<unknown>;
};

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
  curveS?: number;
};

export const tokenCreatedEventAbi = {
  type: "event",
  name: "TokenCreated",
  inputs: [
    { name: "token", type: "address", indexed: true },
    { name: "hook", type: "address", indexed: true },
    { name: "router", type: "address", indexed: false },
    { name: "creator", type: "address", indexed: true },
    { name: "metadataURI", type: "string", indexed: false },
    { name: "socialURI", type: "string", indexed: false },
    { name: "curveS", type: "uint16", indexed: false },
  ],
} as const;

export const tokenV4MigrationProfileBoundEventAbi = {
  type: "event",
  name: "TokenV4MigrationProfileBound",
  inputs: [
    { name: "token", type: "address", indexed: true },
    { name: "profileId", type: "uint256", indexed: true },
    { name: "hooks", type: "address", indexed: true },
    { name: "migrationTarget", type: "address", indexed: false },
  ],
} as const;

type EventLog = {
  address: `0x${string}`;
  data: `0x${string}`;
  topics: readonly [] | readonly [`0x${string}`, ...`0x${string}`[]];
};

function validAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && isAddress(value);
}

function isTokenInfoObject(value: unknown): value is TokenInfoObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const curveS = record.curveS;
  return (
    validAddress(record.token) &&
    validAddress(record.hook) &&
    validAddress(record.router) &&
    validAddress(record.creator) &&
    typeof record.metadataURI === "string" &&
    typeof record.socialURI === "string" &&
    (curveS === undefined || (typeof curveS === "number" && Number.isInteger(curveS) && curveS >= 1 && curveS <= 1000))
  );
}

function requireTokenInfoObject(value: unknown): TokenInfoObject {
  if (isTokenInfoObject(value)) {
    return value;
  }

  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  for (const field of ["token", "hook", "router", "creator"] as const) {
    if (!validAddress(record[field])) {
      throw new Error(`TokenInfo ${field} must be a valid address`);
    }
  }
  for (const field of ["metadataURI", "socialURI"] as const) {
    if (typeof record[field] !== "string") {
      throw new Error(`TokenInfo ${field} must be a string`);
    }
  }
  if (
    record.curveS !== undefined &&
    (typeof record.curveS !== "number" || !Number.isInteger(record.curveS) || record.curveS < 1 || record.curveS > 1000)
  ) {
    throw new Error("TokenInfo curveS must be an integer between 1 and 1000");
  }

  throw new Error("TokenInfo must be an object");
}

export function normalizeTokenInfo(info: unknown): TokenInfoObject {
  if (Array.isArray(info)) {
    if (info.length !== 6) {
      throw new Error("TokenInfo tuple must contain 6 values");
    }

    return requireTokenInfoObject({
      token: info[0],
      hook: info[1],
      router: info[2],
      creator: info[3],
      metadataURI: info[4],
      socialURI: info[5],
    });
  }

  return requireTokenInfoObject(info);
}

export function extractCreatedTokenFromLogs(logs: readonly EventLog[], factoryAddress?: `0x${string}`): TokenInfoObject {
  for (const log of logs) {
    if (factoryAddress && log.address.toLowerCase() !== factoryAddress.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: [tokenCreatedEventAbi],
        data: log.data,
        topics: [...log.topics] as [] | [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName !== "TokenCreated") {
        continue;
      }

      const args = decoded.args as Record<string, unknown>;
      return normalizeTokenInfo({
        token: args.token,
        hook: args.hook,
        router: args.router,
        creator: args.creator,
        metadataURI: args.metadataURI,
        socialURI: args.socialURI,
        curveS: Number(args.curveS),
      });
    } catch {
      continue;
    }
  }

  throw new Error("TokenCreated event not found in transaction receipt");
}

export function extractV4MigrationProfileBindingFromLogs(
  logs: readonly EventLog[],
  factoryAddress?: `0x${string}`,
): {
  token: `0x${string}`;
  profileId: string;
  hooks: `0x${string}`;
  migrationTarget: `0x${string}`;
} {
  for (const log of logs) {
    if (factoryAddress && log.address.toLowerCase() !== factoryAddress.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: [tokenV4MigrationProfileBoundEventAbi],
        data: log.data,
        topics: [...log.topics] as [] | [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName !== "TokenV4MigrationProfileBound") {
        continue;
      }

      const args = decoded.args as Record<string, unknown>;
      if (!validAddress(args.token) || !validAddress(args.hooks) || !validAddress(args.migrationTarget)) {
        throw new Error("TokenV4MigrationProfileBound contains malformed addresses");
      }

      return {
        token: args.token,
        profileId: String(args.profileId),
        hooks: args.hooks,
        migrationTarget: args.migrationTarget,
      };
    } catch {
      continue;
    }
  }

  throw new Error("TokenV4MigrationProfileBound event not found in transaction receipt");
}

export async function readOptionalFactoryRouterImplementation(args: {
  client: FactoryRouterImplementationReader;
  factory: `0x${string}`;
  abi: Abi;
}): Promise<`0x${string}` | undefined> {
  let value: unknown;
  try {
    value = await args.client.readContract({
      address: args.factory,
      abi: args.abi,
      functionName: "routerImplementation",
    });
  } catch {
    return undefined;
  }

  if (!validAddress(value)) {
    throw new Error("Factory routerImplementation must be a valid address");
  }

  return value;
}

export async function readOptionalFactoryHookImplementation(args: {
  client: FactoryHookImplementationReader;
  factory: `0x${string}`;
  abi: Abi;
}): Promise<`0x${string}` | undefined> {
  let value: unknown;
  try {
    value = await args.client.readContract({
      address: args.factory,
      abi: args.abi,
      functionName: "hookImplementation",
    });
  } catch {
    return undefined;
  }

  if (!validAddress(value)) {
    throw new Error("Factory hookImplementation must be a valid address");
  }

  return value;
}

export async function resolveTokenInfo() {
  const deployment = readDeployment();
  const token = getArg("token", latestToken(deployment)) as `0x${string}`;
  const createdToken = deployment.createdTokens.find((entry) => entry.token.toLowerCase() === token.toLowerCase());
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
    curveS: info.curveS,
    v4MigrationProfileId: createdToken?.v4MigrationProfileId,
    v4Hooks: createdToken?.v4Hooks,
    v4MigrationTarget: createdToken?.v4MigrationTarget,
    launchMode: createdToken?.launchMode,
  };
}
