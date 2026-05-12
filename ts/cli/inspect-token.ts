import { publicClient } from "../lib/clients.js";
import { hookAbi, resolveTokenInfo, tokenAbi } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";

const client = publicClient();
const info = await resolveTokenInfo();

const [okbCum, selfDeprecated, liquidityMigrated, totalSupply, minted] = await Promise.all([
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "okbCum" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "selfDeprecated" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "liquidityMigrated" }),
  client.readContract({ address: info.token, abi: tokenAbi, functionName: "totalSupply" }),
  client.readContract({ address: info.hook, abi: hookAbi, functionName: "totalMinted" }),
]);

printJson({
  chainId: info.deployment.chainId,
  token: info.token,
  hook: info.hook,
  router: info.router,
  creator: info.creator,
  metadataURI: info.metadataURI,
  socialURI: info.socialURI,
  okbCum,
  totalSupply,
  minted,
  selfDeprecated,
  liquidityMigrated,
});
