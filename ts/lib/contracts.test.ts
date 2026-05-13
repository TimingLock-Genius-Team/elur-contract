import { strict as assert } from "node:assert";
import test from "node:test";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { extractCreatedTokenFromLogs, normalizeTokenInfo, tokenCreatedEventAbi } from "./contracts.js";

const tokenInfo = {
  token: "0x0000000000000000000000000000000000000001",
  hook: "0x0000000000000000000000000000000000000002",
  router: "0x0000000000000000000000000000000000000003",
  creator: "0x0000000000000000000000000000000000000004",
  metadataURI: "ipfs://metadata",
  socialURI: "https://example.social",
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
    ],
    [tokenInfo.router, tokenInfo.metadataURI, tokenInfo.socialURI],
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
