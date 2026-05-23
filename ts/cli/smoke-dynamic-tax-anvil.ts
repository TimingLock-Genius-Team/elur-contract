import "dotenv/config";
import assert from "node:assert/strict";
import { ANVIL_CHAIN_ID } from "../config/chains.js";
import { deploymentNetwork } from "../config/deployments.js";
import { publicClient } from "../lib/clients.js";
import { hookAbi, resolveTokenInfo, tokenAbi } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";

const client = publicClient();
const info = await resolveTokenInfo();

function field<T>(value: unknown, name: string, index: number): T {
  if (typeof value === "object" && value !== null && name in value) {
    return (value as Record<string, T>)[name];
  }
  if (Array.isArray(value)) {
    return value[index] as T;
  }
  throw new Error(`Missing field ${name}`);
}

const chainId = await client.getChainId();
assert.equal(deploymentNetwork(), "anvil", "dynamic tax smoke only runs against anvil deployments");
assert.equal(chainId, ANVIL_CHAIN_ID, "dynamic tax smoke requires an anvil chain");

const [params, quoteBuy, quoteSell, taxBurnedTokensRaw, totalSupplyRaw, totalMintedRaw] = await Promise.all([
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "getCurveParams" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "quoteBuy", args: [1_000_000_000_000_000_000n] }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "quoteSell", args: [1_000_000_000_000_000_000n] }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "taxBurnedTokens" }),
  client.readContract({ address: info.token, abi: tokenAbi, functionName: "totalSupply" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "totalMinted" }),
]);

const feeBps = Number(field<bigint | number>(params, "feeBps", 2));
const burnTaxMinBps = Number(field<bigint | number>(params, "burnTaxMinBps", 3));
const burnTaxMaxBps = Number(field<bigint | number>(params, "burnTaxMaxBps", 4));
const buyGrossTokensOut = field<bigint>(quoteBuy, "grossTokensOut", 9);
const buyTokensOut = field<bigint>(quoteBuy, "tokensOut", 7);
const buyBurnTaxTokens = field<bigint>(quoteBuy, "burnTaxTokens", 10);
const sellTokensIn = field<bigint>(quoteSell, "tokensIn", 0);
const sellEffectiveTokensIn = field<bigint>(quoteSell, "effectiveTokensIn", 10);
const sellBurnTaxTokens = field<bigint>(quoteSell, "burnTaxTokens", 9);
const taxBurnedTokens = taxBurnedTokensRaw as bigint;
const totalSupply = totalSupplyRaw as bigint;
const totalMinted = totalMintedRaw as bigint;

assert.equal(feeBps, info.deployment.createdTokens.at(-1)?.feeBps ?? info.deployment.curve.feeBps);
assert.equal(burnTaxMinBps, info.deployment.createdTokens.at(-1)?.burnTaxMinBps ?? info.deployment.curve.burnTaxMinBps);
assert.equal(burnTaxMaxBps, info.deployment.createdTokens.at(-1)?.burnTaxMaxBps ?? info.deployment.curve.burnTaxMaxBps);
assert.equal(buyGrossTokensOut, buyTokensOut, "buy quote must not apply curve burn tax");
assert.equal(buyBurnTaxTokens, 0n, "buy quote burn tax must be zero");
assert.equal(sellBurnTaxTokens, 0n, "sell quote burn tax must be zero");
assert.equal(sellEffectiveTokensIn, sellTokensIn - sellBurnTaxTokens);
assert.equal(taxBurnedTokens, 0n, "curve phase must not accumulate burned tax tokens");
const supplyAndBurns = totalSupply + taxBurnedTokens;
const mintedDust = supplyAndBurns > totalMinted ? supplyAndBurns - totalMinted : totalMinted - supplyAndBurns;
assert.ok(mintedDust <= 1_000_000_000_000n, "supply plus burns must track curve minted amount within dust");

printJson({
  ok: true,
  chainId,
  token: info.token,
  hook: info.hook,
  router: info.router,
  feeBps,
  burnTaxMinBps,
  burnTaxMaxBps,
  quoteBuy,
  quoteSell,
  taxBurnedTokens,
  totalSupply,
  totalMinted,
  mintedDust,
});
