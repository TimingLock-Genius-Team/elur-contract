import { getAddress } from "viem";
import { readDeployment, writeDeployment } from "../config/deployments.js";
import { getArg } from "../lib/args.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import {
  bigintArg,
  directV4LaunchFactoryAbi,
  directV4LaunchFactoryAddress,
  hookEntryFeeConfig,
  hookEntryHook,
  numberArg,
  registryAbi,
  registryAddress,
} from "../lib/v4-hook-registry-cli.js";

const deployment = readDeployment();
const wallet = walletClient();
const client = publicClient();
const registry = registryAddress();
const directFactory = directV4LaunchFactoryAddress();
const entryId = bigintArg(getArg("hook-registry-entry"), "hook-registry-entry");
const nativeAmount = bigintArg(getArg("native-amount-wei"), "native-amount-wei");

const entry = await client.readContract({
  address: registry,
  abi: registryAbi,
  functionName: "getHookEntry",
  args: [entryId],
}) as unknown;
const hooks = hookEntryHook(entry);
const feeConfig = hookEntryFeeConfig(entry);
if (!feeConfig) {
  throw new Error("HookEntry feeConfig is missing");
}
const nativeTemplateFee = feeConfig.feeCurrency === "0x0000000000000000000000000000000000000000"
  ? feeConfig.oneTimeFee
  : 0n;

const hash = await wallet.writeContract({
  address: directFactory,
  abi: directV4LaunchFactoryAbi,
  functionName: "createDirectV4Launch",
  args: [{
    name: getArg("name"),
    symbol: getArg("symbol"),
    metadataURI: getArg("metadata-uri", ""),
    hookRegistryEntryId: entryId,
    hooks: getAddress(getArg("hooks", hooks)),
    sqrtPriceX96: bigintArg(getArg("sqrt-price-x96"), "sqrt-price-x96"),
    poolFee: numberArg(getArg("pool-fee", "3000"), "pool-fee"),
    tickSpacing: numberArg(getArg("tick-spacing", "60"), "tick-spacing"),
    tickLower: numberArg(getArg("tick-lower"), "tick-lower"),
    tickUpper: numberArg(getArg("tick-upper"), "tick-upper"),
    liquidity: bigintArg(getArg("liquidity"), "liquidity"),
    tokenAmount: bigintArg(getArg("token-amount"), "token-amount"),
    nativeAmount,
    lpRecipient: getAddress(getArg("lp-recipient")),
    hookData: getArg("hook-data", "0x"),
  }],
  value: nativeAmount + nativeTemplateFee,
});
const receipt = await waitForSuccessfulTransactionReceipt({ client, hash, label: "createDirectV4Launch" });
const launchId = await client.readContract({
  address: directFactory,
  abi: directV4LaunchFactoryAbi,
  functionName: "nextDirectV4LaunchId",
}) as bigint;
const launch = await client.readContract({
  address: directFactory,
  abi: directV4LaunchFactoryAbi,
  functionName: "getDirectV4Launch",
  args: [launchId],
}) as {
  token: `0x${string}`;
  hooks: `0x${string}`;
};

deployment.createdTokens.push({
  token: launch.token,
  hook: directFactory,
  router: directFactory,
  v4Hooks: launch.hooks,
  launchMode: "DIRECT_V4_HOOK_POOL",
});
writeDeployment(deployment);

printJson({
  chainId: deployment.chainId,
  directFactory,
  launchId: launchId.toString(),
  token: launch.token,
  hooks: launch.hooks,
  nativeTemplateFee: nativeTemplateFee.toString(),
  txHash: hash,
  blockNumber: receipt.blockNumber,
});
