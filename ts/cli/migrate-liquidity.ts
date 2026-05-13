import { stringToHex } from "viem";
import { publicClient, walletClient } from "../lib/clients.js";
import { getArg } from "../lib/args.js";
import { hookAbi, resolveTokenInfo } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";

const wallet = walletClient();
const client = publicClient();
const info = await resolveTokenInfo();
const migrationData = stringToHex(getArg("data", "eulr-ts-migration"));

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
