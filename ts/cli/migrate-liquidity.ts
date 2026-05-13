import { isHex, type Hex } from "viem";
import { deploymentNetwork } from "../config/deployments.js";
import { readMigrationTargetDeployment } from "../config/migration-target-deployments.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { optionalArg } from "../lib/args.js";
import { hookAbi, resolveTokenInfo, tokenAbi } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";
import { encodeMigrationDataParams, hookDataHexFromEnv } from "../lib/migration-data.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";

const wallet = walletClient();
const client = publicClient();
const info = await resolveTokenInfo();
const migrationData = await resolveMigrationData();

const hash = await wallet.writeContract({
  address: info.hook,
  abi: hookAbi,
  functionName: "migrateLiquidity",
  args: [migrationData],
});
const receipt = await waitForSuccessfulTransactionReceipt({ client, hash, label: "migrateLiquidity" });

const liquidityMigrated = await client.readContract({
  address: info.hook,
  abi: hookAbi,
  functionName: "liquidityMigrated",
});

printJson({
  chainId: info.deployment.chainId,
  token: info.token,
  hook: info.hook,
  txHash: hash,
  blockNumber: receipt.blockNumber,
  liquidityMigrated,
});

async function resolveMigrationData(): Promise<Hex> {
  const explicitData = optionalArg("data");
  if (explicitData !== undefined) {
    if (!isHex(explicitData)) {
      throw new Error("--data must be raw hex migration calldata bytes");
    }
    return explicitData;
  }

  const network = deploymentNetwork();
  if (network === "anvil") {
    return "0x";
  }

  const migrationTargetDeployment = readMigrationTargetDeployment(network);
  if (migrationTargetDeployment.migrationTarget.toLowerCase() !== info.deployment.migrationTarget.toLowerCase()) {
    throw new Error("migration target deployment record does not match factory deployment");
  }

  const [claimableFeeOkb, hookBalance, totalSupply, block] = await Promise.all([
    client.readContract({ address: info.hook, abi: hookAbi, functionName: "claimableFeeOkb" }),
    client.getBalance({ address: info.hook }),
    client.readContract({ address: info.token, abi: tokenAbi, functionName: "totalSupply" }),
    client.getBlock(),
  ]);
  const okbAmount = hookBalance - (claimableFeeOkb as bigint);
  const k = BigInt(info.deployment.curve.k);
  const tokenSupply = totalSupply as bigint;
  const tokenAmount = k > tokenSupply ? k - tokenSupply : 0n;
  const deadlineSeconds = BigInt(process.env.MIGRATION_DEADLINE_SECONDS ?? "3600");
  const liquidity = BigInt(migrationTargetDeployment.migrationPool.migrationLiquidity);

  return encodeMigrationDataParams({
    currency0: "0x0000000000000000000000000000000000000000",
    currency1: info.token,
    hooks: migrationTargetDeployment.migrationPool.hooks,
    poolFee: migrationTargetDeployment.migrationPool.poolFee,
    tickSpacing: migrationTargetDeployment.migrationPool.tickSpacing,
    tickLower: migrationTargetDeployment.migrationPool.tickLower,
    tickUpper: migrationTargetDeployment.migrationPool.tickUpper,
    liquidity,
    amount0Max: okbAmount,
    amount1Max: tokenAmount,
    deadline: block.timestamp + deadlineSeconds,
    lpRecipient: migrationTargetDeployment.lpRecipient,
    hookData: hookDataHexFromEnv(),
  });
}
