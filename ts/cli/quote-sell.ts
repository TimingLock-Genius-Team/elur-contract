import { publicClient } from "../lib/clients.js";
import { getArg } from "../lib/args.js";
import { hookAbi, resolveTokenInfo } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";
import { parseToken } from "../lib/units.js";

const client = publicClient();
const info = await resolveTokenInfo();
const tokens = parseToken(getArg("tokens"));

const quote = await client.readContract({
  address: info.hook,
  abi: hookAbi,
  functionName: "quoteSell",
  args: [tokens],
});

printJson({ chainId: info.deployment.chainId, token: info.token, hook: info.hook, quote });
