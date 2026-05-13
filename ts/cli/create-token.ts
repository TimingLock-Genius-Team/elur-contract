import { artifacts } from "../config/artifacts.js";
import { readDeployment, writeDeployment } from "../config/deployments.js";
import { abiOf } from "../lib/artifacts.js";
import { walletClient, publicClient } from "../lib/clients.js";
import { getArg } from "../lib/args.js";
import { printJson } from "../lib/json.js";
import { extractCreatedTokenFromLogs } from "../lib/contracts.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";

const deployment = readDeployment();
const wallet = walletClient();
const publicRpc = publicClient();
const factoryAbi = abiOf(artifacts.factory);

const name = getArg("name");
const symbol = getArg("symbol");
const metadataURI = getArg("metadata-uri", "");
const socialURI = getArg("social-uri", "");

const hash = await wallet.writeContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "createToken",
  args: [name, symbol, metadataURI, socialURI],
});
const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: "createToken" });
const tokenInfo = extractCreatedTokenFromLogs(receipt.logs, deployment.factory);
deployment.createdTokens.push({ token: tokenInfo.token, hook: tokenInfo.hook, router: tokenInfo.router });
writeDeployment(deployment);

printJson({
  chainId: deployment.chainId,
  token: tokenInfo.token,
  hook: tokenInfo.hook,
  router: tokenInfo.router,
  txHash: hash,
  blockNumber: receipt.blockNumber,
});
