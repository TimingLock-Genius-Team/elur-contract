import { strict as assert } from "node:assert";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { ANVIL_CHAIN_ID, DEFAULT_ANVIL_RPC_URL, HASHKEYTEST_CHAIN_ID, XLAYER_CHAIN_ID } from "../config/chains.js";
import { chainConfig, rpcUrl, walletClient } from "./clients.js";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function withArgv<T>(argv: string[], fn: () => T): T {
  const originalArgv = process.argv;
  process.argv = argv;
  try {
    return fn();
  } finally {
    process.argv = originalArgv;
  }
}

test("rpcUrl defaults to local anvil", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalAnvilRpc = process.env.ANVIL_RPC_URL;
  delete process.env.DEPLOYMENT_NETWORK;
  delete process.env.ANVIL_RPC_URL;

  try {
    withArgv(["node", "script"], () => {
      assert.equal(rpcUrl(), DEFAULT_ANVIL_RPC_URL);
      assert.equal(chainConfig().id, ANVIL_CHAIN_ID);
    });
  } finally {
    restoreEnv("DEPLOYMENT_NETWORK", originalNetwork);
    restoreEnv("ANVIL_RPC_URL", originalAnvilRpc);
  }
});

test("rpcUrl uses xlayer RPC and chain id for xlayer network", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalXLayerRpc = process.env.XLAYER_RPC_URL;
  const originalXLayerChainId = process.env.XLAYER_CHAIN_ID;
  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.env.XLAYER_RPC_URL = "https://xlayer.example";
  process.env.XLAYER_CHAIN_ID = "196";

  try {
    withArgv(["node", "script"], () => {
      assert.equal(rpcUrl(), "https://xlayer.example");
      assert.equal(chainConfig().id, XLAYER_CHAIN_ID);
    });
  } finally {
    restoreEnv("DEPLOYMENT_NETWORK", originalNetwork);
    restoreEnv("XLAYER_RPC_URL", originalXLayerRpc);
    restoreEnv("XLAYER_CHAIN_ID", originalXLayerChainId);
  }
});

test("rpcUrl uses temporary hashkeytest RPC and chain id", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalHashKeyTestRpc = process.env.HASHKEYTEST_RPC_URL;
  process.env.DEPLOYMENT_NETWORK = "hashkeytest";
  process.env.HASHKEYTEST_RPC_URL = "https://hashkeytest.example";

  try {
    withArgv(["node", "script"], () => {
      assert.equal(rpcUrl(), "https://hashkeytest.example");
      assert.equal(chainConfig().id, HASHKEYTEST_CHAIN_ID);
    });
  } finally {
    restoreEnv("DEPLOYMENT_NETWORK", originalNetwork);
    restoreEnv("HASHKEYTEST_RPC_URL", originalHashKeyTestRpc);
  }
});

test("walletClient uses hashkeytest owner private key fallback", async () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalHashKeyTestRpc = process.env.HASHKEYTEST_RPC_URL;
  const originalPrivateKey = process.env.PRIVATE_KEY;
  const originalHashKeyTestOwnerPrivateKey = process.env.HASHKEYTEST_OWNER_PRIVATE_KEY;
  const ownerPrivateKey = `0x${"1".repeat(64)}` as `0x${string}`;
  process.env.DEPLOYMENT_NETWORK = "hashkeytest";
  process.env.HASHKEYTEST_RPC_URL = "https://hashkeytest.example";
  process.env.HASHKEYTEST_OWNER_PRIVATE_KEY = ownerPrivateKey;
  process.env.PRIVATE_KEY = "";

  try {
    await withArgv(["node", "script"], async () => {
      assert.deepEqual(await walletClient().getAddresses(), [privateKeyToAccount(ownerPrivateKey).address]);
    });
  } finally {
    restoreEnv("DEPLOYMENT_NETWORK", originalNetwork);
    restoreEnv("HASHKEYTEST_RPC_URL", originalHashKeyTestRpc);
    restoreEnv("PRIVATE_KEY", originalPrivateKey);
    restoreEnv("HASHKEYTEST_OWNER_PRIVATE_KEY", originalHashKeyTestOwnerPrivateKey);
  }
});

test("walletClient prefers hashkeytest owner private key over generic private key", async () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalHashKeyTestRpc = process.env.HASHKEYTEST_RPC_URL;
  const originalPrivateKey = process.env.PRIVATE_KEY;
  const originalHashKeyTestOwnerPrivateKey = process.env.HASHKEYTEST_OWNER_PRIVATE_KEY;
  const genericPrivateKey = `0x${"1".repeat(64)}` as `0x${string}`;
  const ownerPrivateKey = `0x${"2".repeat(64)}` as `0x${string}`;
  process.env.DEPLOYMENT_NETWORK = "hashkeytest";
  process.env.HASHKEYTEST_RPC_URL = "https://hashkeytest.example";
  process.env.PRIVATE_KEY = genericPrivateKey;
  process.env.HASHKEYTEST_OWNER_PRIVATE_KEY = ownerPrivateKey;

  try {
    await withArgv(["node", "script"], async () => {
      assert.deepEqual(await walletClient().getAddresses(), [privateKeyToAccount(ownerPrivateKey).address]);
    });
  } finally {
    restoreEnv("DEPLOYMENT_NETWORK", originalNetwork);
    restoreEnv("HASHKEYTEST_RPC_URL", originalHashKeyTestRpc);
    restoreEnv("PRIVATE_KEY", originalPrivateKey);
    restoreEnv("HASHKEYTEST_OWNER_PRIVATE_KEY", originalHashKeyTestOwnerPrivateKey);
  }
});

test("--network overrides DEPLOYMENT_NETWORK for RPC selection", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalAnvilRpc = process.env.ANVIL_RPC_URL;
  process.env.DEPLOYMENT_NETWORK = "xlayer";
  process.env.ANVIL_RPC_URL = "http://anvil.example";

  try {
    withArgv(["node", "script", "--network", "anvil"], () => {
      assert.equal(rpcUrl(), "http://anvil.example");
      assert.equal(chainConfig().id, ANVIL_CHAIN_ID);
    });
  } finally {
    restoreEnv("DEPLOYMENT_NETWORK", originalNetwork);
    restoreEnv("ANVIL_RPC_URL", originalAnvilRpc);
  }
});

test("xlayer RPC is required for xlayer network", () => {
  const originalNetwork = process.env.DEPLOYMENT_NETWORK;
  const originalXLayerRpc = process.env.XLAYER_RPC_URL;
  process.env.DEPLOYMENT_NETWORK = "xlayer";
  delete process.env.XLAYER_RPC_URL;

  try {
    withArgv(["node", "script"], () => {
      assert.throws(() => rpcUrl(), /XLAYER_RPC_URL is required/);
    });
  } finally {
    restoreEnv("DEPLOYMENT_NETWORK", originalNetwork);
    restoreEnv("XLAYER_RPC_URL", originalXLayerRpc);
  }
});
