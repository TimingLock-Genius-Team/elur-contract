import { getAddress } from "viem";
import { artifacts } from "../config/artifacts.js";
import { readDeployment } from "../config/deployments.js";
import { abiOf } from "../lib/artifacts.js";
import { optionalArg } from "../lib/args.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { migrationPoolConfigFromEnv } from "../lib/migration-data.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { bigintArg, registryAbi, registryAddress } from "../lib/v4-hook-registry-cli.js";

const deployment = readDeployment();
const wallet = walletClient();
const client = publicClient();
const factoryAbi = abiOf(artifacts.factory);

const migrationPool = migrationPoolConfigFromEnv();
const migrationTarget = getAddress(optionalArg("migration-target") ?? deployment.migrationTarget);
const active = optionalArg("inactive") === undefined;
const hookRegistryEntryId = optionalArg("hook-registry-entry") === undefined
  ? 0n
  : bigintArg(optionalArg("hook-registry-entry")!, "hook-registry-entry");
const registry = hookRegistryEntryId === 0n ? undefined : registryAddress();
const registryEntry = registry
  ? await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "getHookEntry",
      args: [hookRegistryEntryId],
    }) as { hook: `0x${string}` }
  : undefined;

const hash = await wallet.writeContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "registerV4MigrationProfile",
  args: [{
    hookRegistryEntryId,
    migrationTarget,
    hooks: registryEntry?.hook ?? migrationPool.hooks,
    poolFee: migrationPool.poolFee,
    tickSpacing: migrationPool.tickSpacing,
    tickLower: migrationPool.tickLower,
    tickUpper: migrationPool.tickUpper,
    hookDataHash: migrationPool.hookDataHash,
    active,
  }],
});
const receipt = await waitForSuccessfulTransactionReceipt({
  client,
  hash,
  label: "registerV4MigrationProfile",
});
const profileId = await client.readContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "nextV4MigrationProfileId",
}) as bigint;

printJson({
  chainId: deployment.chainId,
  profileId: profileId.toString(),
  migrationTarget,
  hookRegistryEntryId: hookRegistryEntryId.toString(),
  ...migrationPool,
  hooks: registryEntry?.hook ?? migrationPool.hooks,
  active,
  txHash: hash,
  blockNumber: receipt.blockNumber,
});
