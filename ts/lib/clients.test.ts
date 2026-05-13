import { strict as assert } from "node:assert";
import test from "node:test";
import { ANVIL_CHAIN_ID, DEFAULT_ANVIL_RPC_URL, XLAYER_CHAIN_ID } from "../config/chains.js";
import { chainConfig, rpcUrl } from "./clients.js";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function withArgv(argv: string[], fn: () => void): void {
  const originalArgv = process.argv;
  process.argv = argv;
  try {
    fn();
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
