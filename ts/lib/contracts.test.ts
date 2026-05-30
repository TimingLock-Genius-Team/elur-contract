import { strict as assert } from "node:assert";
import test from "node:test";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import {
  extractV4MigrationProfileBindingFromLogs,
  extractCreatedTokenFromLogs,
  normalizeTokenInfo,
  readOptionalFactoryRouterImplementation,
  tokenV4MigrationProfileBoundEventAbi,
  tokenCreatedEventAbi,
} from "./contracts.js";

const tokenInfo = {
  token: "0x0000000000000000000000000000000000000001",
  hook: "0x0000000000000000000000000000000000000002",
  router: "0x0000000000000000000000000000000000000003",
  creator: "0x0000000000000000000000000000000000000004",
  metadataURI: "ipfs://metadata",
  socialURI: "https://example.social",
  curveS: 25,
} as const;

test("normalizeTokenInfo rejects malformed tuple values", () => {
  assert.throws(
    () => normalizeTokenInfo([tokenInfo.token, tokenInfo.hook]),
    /TokenInfo tuple must contain 6 values/,
  );
});

test("normalizeTokenInfo rejects invalid object addresses", () => {
  assert.throws(
    () => normalizeTokenInfo({ ...tokenInfo, router: "not-an-address" }),
    /TokenInfo router must be a valid address/,
  );
});

test("extractCreatedTokenFromLogs returns token addresses from TokenCreated logs", () => {
  const topics = encodeEventTopics({
    abi: [tokenCreatedEventAbi],
    eventName: "TokenCreated",
    args: {
      token: tokenInfo.token,
      hook: tokenInfo.hook,
      creator: tokenInfo.creator,
    },
  }) as readonly [`0x${string}`, ...`0x${string}`[]];
  const data = encodeAbiParameters(
    [
      { name: "router", type: "address" },
      { name: "metadataURI", type: "string" },
      { name: "socialURI", type: "string" },
      { name: "curveS", type: "uint16" },
    ],
    [tokenInfo.router, tokenInfo.metadataURI, tokenInfo.socialURI, tokenInfo.curveS],
  );

  const logs = [{
    address: "0x00000000000000000000000000000000000000f0",
    data,
    topics,
  }] as const;

  assert.deepEqual(extractCreatedTokenFromLogs(logs), tokenInfo);
});

test("extractCreatedTokenFromLogs rejects receipts without TokenCreated logs", () => {
  assert.throws(() => extractCreatedTokenFromLogs([]), /TokenCreated event not found/);
});

test("extractV4MigrationProfileBindingFromLogs returns profile binding from factory logs", () => {
  const token = tokenInfo.token;
  const hooks = "0x00000000000000000000000000000000000000C8";
  const migrationTarget = "0x00000000000000000000000000000000000000f1";
  const topics = encodeEventTopics({
    abi: [tokenV4MigrationProfileBoundEventAbi],
    eventName: "TokenV4MigrationProfileBound",
    args: {
      token,
      profileId: 7n,
      hooks,
    },
  }) as readonly [`0x${string}`, ...`0x${string}`[]];
  const data = encodeAbiParameters([{ name: "migrationTarget", type: "address" }], [migrationTarget]);

  const binding = extractV4MigrationProfileBindingFromLogs([{
    address: "0x00000000000000000000000000000000000000f0",
    data,
    topics,
  }]);

  assert.deepEqual(binding, {
    token,
    profileId: "7",
    hooks,
    migrationTarget,
  });
});

test("extractV4MigrationProfileBindingFromLogs rejects receipts without profile binding logs", () => {
  assert.throws(
    () => extractV4MigrationProfileBindingFromLogs([]),
    /TokenV4MigrationProfileBound event not found/,
  );
});

test("readOptionalFactoryRouterImplementation returns undefined for legacy factories", async () => {
  const client = {
    readContract: async () => {
      throw new Error("function selector was not recognized");
    },
  };

  const routerImplementation = await readOptionalFactoryRouterImplementation({
    client,
    factory: "0x00000000000000000000000000000000000000f0",
    abi: [],
  });

  assert.equal(routerImplementation, undefined);
});

test("readOptionalFactoryRouterImplementation validates new factory return values", async () => {
  const client = {
    readContract: async () => "0x0000000000000000000000000000000000000010",
  };

  const routerImplementation = await readOptionalFactoryRouterImplementation({
    client,
    factory: "0x00000000000000000000000000000000000000f0",
    abi: [],
  });

  assert.equal(routerImplementation, "0x0000000000000000000000000000000000000010");
});

test("readOptionalFactoryRouterImplementation rejects malformed new factory return values", async () => {
  const client = {
    readContract: async () => "not-an-address",
  };

  await assert.rejects(
    () =>
      readOptionalFactoryRouterImplementation({
        client,
        factory: "0x00000000000000000000000000000000000000f0",
        abi: [],
      }),
    /Factory routerImplementation must be a valid address/,
  );
});
