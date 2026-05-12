import { publicClient } from "../lib/clients.js";
import { getArg } from "../lib/args.js";
import { hookAbi, resolveTokenInfo } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";
import { parseOkb } from "../lib/units.js";

const client = publicClient();
const info = await resolveTokenInfo();
const okb = parseOkb(getArg("okb"));

const quote = await client.readContract({
  address: info.hook,
  abi: hookAbi,
  functionName: "quoteBuy",
  args: [okb],
});

printJson({ chainId: info.deployment.chainId, token: info.token, hook: info.hook, quote });
