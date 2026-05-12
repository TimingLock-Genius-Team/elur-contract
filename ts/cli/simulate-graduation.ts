import { publicClient, walletClient } from "../lib/clients.js";
import { hookAbi, resolveTokenInfo, routerAbi } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";
import { parseOkb } from "../lib/units.js";

const wallet = walletClient();
const client = publicClient();
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

  const hash = await wallet.writeContract({
    address: info.router,
    abi: routerAbi,
    functionName: "buy",
    args: [info.token, 0n, buyer],
    value: parseOkb("10"),
  });
  await client.waitForTransactionReceipt({ hash });
  buys += 1;
}

const [okbCum, minted] = await Promise.all([
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "okbCum" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "totalMinted" }),
]);

printJson({ chainId: info.deployment.chainId, token: info.token, buys, okbCum, minted, selfDeprecated: true });
