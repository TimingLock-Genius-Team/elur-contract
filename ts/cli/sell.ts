import { getAddress } from "viem";
import { publicClient, walletClient } from "../lib/clients.js";
import { getArg, getRequiredMinOutArg } from "../lib/args.js";
import { hookAbi, resolveTokenInfo, routerAbi, tokenAbi } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { parseToken } from "../lib/units.js";

const wallet = walletClient();
const client = publicClient();
const info = await resolveTokenInfo();
const tokens = parseToken(getArg("tokens"));
const minOut = getRequiredMinOutArg();
const recipient = getAddress(getArg("recipient", (await wallet.getAddresses())[0]));

const approvalHash = await wallet.writeContract({
  address: info.token,
  abi: tokenAbi,
  functionName: "approve",
  args: [info.router, tokens],
});
await waitForSuccessfulTransactionReceipt({ client, hash: approvalHash, label: "approve" });

const hash = await wallet.writeContract({
  address: info.router,
  abi: routerAbi,
  functionName: "sell",
  args: [info.token, tokens, minOut, recipient],
});
const receipt = await waitForSuccessfulTransactionReceipt({ client, hash, label: "sell" });

const [okbCum, minted, selfDeprecated] = await Promise.all([
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "okbCum" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "totalMinted" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "selfDeprecated" }),
]);

printJson({
  chainId: info.deployment.chainId,
  token: info.token,
  tokensIn: tokens,
  minOut,
  approvalHash,
  txHash: hash,
  blockNumber: receipt.blockNumber,
  okbCum,
  minted,
  selfDeprecated,
});
