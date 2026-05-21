import "dotenv/config";
import assert from "node:assert/strict";
import { ANVIL_CHAIN_ID } from "../config/chains.js";
import { deploymentNetwork } from "../config/deployments.js";
import { publicClient } from "../lib/clients.js";
import { hookAbi, resolveTokenInfo, tokenAbi } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";
import { readProxyImplementation } from "../lib/proxy.js";

const client = publicClient();
const info = await resolveTokenInfo();
const chainId = await client.getChainId();

assert.equal(deploymentNetwork(), "anvil", "hook upgrade smoke only runs against anvil deployments");
assert.equal(chainId, ANVIL_CHAIN_ID, "hook upgrade smoke requires an anvil chain");

const recordedImplementation = info.deployment.createdTokens.at(-1)?.hookImplementation ?? info.deployment.hookImplementation;
assert.ok(recordedImplementation, "deployment JSON must record a hook implementation");

const [proxyImplementation, okbCum, taxBurnedTokens, totalSupply] = await Promise.all([
  readProxyImplementation(client, info.hook),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "okbCum" }) as Promise<bigint>,
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "taxBurnedTokens" }) as Promise<bigint>,
  client.readContract({ address: info.token, abi: tokenAbi, functionName: "totalSupply" }) as Promise<bigint>,
]);

assert.equal(proxyImplementation.toLowerCase(), recordedImplementation.toLowerCase());
assert.ok(okbCum > 0n, "created token must preserve Hook okbCum after upgrade");
assert.ok(totalSupply > 0n, "created token must preserve token balances after Hook upgrade");

printJson({
  ok: true,
  chainId,
  token: info.token,
  hook: info.hook,
  proxyImplementation,
  okbCum,
  taxBurnedTokens,
  totalSupply,
});
