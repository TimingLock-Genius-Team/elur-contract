import { abiOf } from "../lib/artifacts.js";
import { walletClient, publicClient } from "../lib/clients.js";
import { getArg } from "../lib/args.js";
import { readDeployment, writeDeployment } from "../lib/deployments.js";
import { printJson } from "../lib/json.js";
import { normalizeTokenInfo } from "../lib/contracts.js";

const deployment = readDeployment();
const wallet = walletClient();
const publicRpc = publicClient();
const factoryAbi = abiOf("SatpadFactory.sol/SatpadFactory.json");

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
const receipt = await publicRpc.waitForTransactionReceipt({ hash });

const length = await publicRpc.readContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "allTokensLength",
});
const token = await publicRpc.readContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "allTokens",
  args: [(length as bigint) - 1n],
});
const info = await publicRpc.readContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "getTokenInfo",
  args: [token],
});

const tokenInfo = normalizeTokenInfo(info);
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
