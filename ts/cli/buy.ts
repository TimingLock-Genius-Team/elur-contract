import { publicClient, walletClient } from "../lib/clients.js";
import { getArg } from "../lib/args.js";
import { hookAbi, resolveTokenInfo, routerAbi } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";
import { parseOkb } from "../lib/units.js";

const wallet = walletClient();
const client = publicClient();
const info = await resolveTokenInfo();
const okb = parseOkb(getArg("okb"));
const minOut = BigInt(getArg("min-out", "0"));
const recipient = getArg("recipient", (await wallet.getAddresses())[0]) as `0x${string}`;

const hash = await wallet.writeContract({
  address: info.router,
  abi: routerAbi,
  functionName: "buy",
  args: [info.token, minOut, recipient],
  value: okb,
});
const receipt = await client.waitForTransactionReceipt({ hash });

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
  txHash: hash,
  blockNumber: receipt.blockNumber,
  okbCum,
  minted,
  selfDeprecated,
});
