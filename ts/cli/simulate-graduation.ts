import { publicClient, walletClient } from "../lib/clients.js";
import { deploymentNetwork } from "../config/deployments.js";
import { hasArg, optionalArg } from "../lib/args.js";
import { hookAbi, resolveTokenInfo, routerAbi } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";
import { assertLocalSimulationOrAllowed, maxIterationsFromArg } from "../lib/live-run-guard.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { parseOkb } from "../lib/units.js";

const network = deploymentNetwork();
const allowLive = hasArg("allow-live");
if (!allowLive && network !== "anvil") {
  throw new Error("simulate-graduation refuses to run outside Anvil without --allow-live");
}

const client = publicClient();
const chainId = await client.getChainId();
const maxBuys = maxIterationsFromArg(optionalArg("max-buys"));

assertLocalSimulationOrAllowed({
  allowLive,
  chainId,
  maxIterations: maxBuys,
  network,
  scriptName: "simulate-graduation",
});

const wallet = walletClient();
const info = await resolveTokenInfo();
const buyer = (await wallet.getAddresses())[0];

let buys = 0;
while (true) {
  const selfDeprecated = await client.readContract({
    address: info.hook,
    abi: hookAbi,
    functionName: "selfDeprecated",
  });
  if (selfDeprecated) {
    break;
  }
  if (maxBuys !== undefined && buys >= maxBuys) {
    throw new Error(`simulate-graduation reached --max-buys ${maxBuys} before selfDeprecated`);
  }

  const hash = await wallet.writeContract({
    address: info.router,
    abi: routerAbi,
    functionName: "buy",
    args: [info.token, 0n, buyer],
    value: parseOkb("10"),
  });
  await waitForSuccessfulTransactionReceipt({ client, hash, label: "buy" });
  buys += 1;
}

const [okbCum, minted] = await Promise.all([
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "okbCum" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "totalMinted" }),
]);

printJson({ chainId: info.deployment.chainId, token: info.token, buys, okbCum, minted, selfDeprecated: true });
