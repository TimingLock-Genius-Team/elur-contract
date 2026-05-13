import { strict as assert } from "node:assert";
import test from "node:test";
import {
  ANVIL_CHAIN_ID,
  DEFAULT_ANVIL_RPC_URL,
  XLAYER_CHAIN_ID,
  chainConfigFor,
  rpcUrlFromEnv,
  rpcEnvKeyForNetwork,
} from "./chains.js";

test("chain config exposes canonical local and XLayer chain metadata", () => {
  assert.equal(ANVIL_CHAIN_ID, 31337);
  assert.equal(XLAYER_CHAIN_ID, 196);
  assert.equal(DEFAULT_ANVIL_RPC_URL, "http://127.0.0.1:8545");
  assert.equal(rpcEnvKeyForNetwork("xlayer"), "XLAYER_RPC_URL");
  assert.equal(chainConfigFor("anvil", DEFAULT_ANVIL_RPC_URL).id, ANVIL_CHAIN_ID);
  assert.equal(chainConfigFor("xlayer", "https://rpc.xlayer.example").id, XLAYER_CHAIN_ID);
});

test("network-specific RPC env has priority over generic RPC_URL", () => {
  assert.equal(
    rpcUrlFromEnv("xlayer", {
      RPC_URL: "http://127.0.0.1:8545",
      XLAYER_RPC_URL: "https://xlayer.example",
    }),
    "https://xlayer.example",
  );
  assert.equal(rpcUrlFromEnv("base", { RPC_URL: "https://base.example" }), "https://base.example");
});
