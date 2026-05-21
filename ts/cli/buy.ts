import { getAddress } from "viem";
import { publicClient, walletClient } from "../lib/clients.js";
import { getArg, getRequiredMinOutArg } from "../lib/args.js";
import { hookAbi, resolveTokenInfo, routerAbi } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { parseOkb } from "../lib/units.js";

const wallet = walletClient();
const client = publicClient();
const info = await resolveTokenInfo();
const okb = parseOkb(getArg("okb"));
const minOut = getRequiredMinOutArg();
const recipient = getAddress(getArg("recipient", (await wallet.getAddresses())[0]));
const quote = await client.readContract({
  address: info.hook,
  abi: hookAbi,
  functionName: "quoteBuy",
  args: [okb],
});

const hash = await wallet.writeContract({
  address: info.router,
  abi: routerAbi,
  functionName: "buy",
  args: [info.token, minOut, recipient],
  value: okb,
});
const receipt = await waitForSuccessfulTransactionReceipt({ client, hash, label: "buy" });

const [okbCum, minted, selfDeprecated] = await Promise.all([
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "okbCum" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "totalMinted" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "selfDeprecated" }),
]);

printJson({
  chainId: info.deployment.chainId,
  token: info.token,
  inputOkb: okb,
  minOut,
  quote,
  txHash: hash,
  blockNumber: receipt.blockNumber,
  okbCum,
  minted,
  selfDeprecated,
});
