import { publicClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";
import { registryAbi, registryAddress } from "../lib/v4-hook-registry-cli.js";

const client = publicClient();
const registry = registryAddress();
const nextHookEntryId = await client.readContract({
  address: registry,
  abi: registryAbi,
  functionName: "nextHookEntryId",
}) as bigint;

const entries = [];
for (let entryId = 1n; entryId <= nextHookEntryId; entryId++) {
  const entry = await client.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "getHookEntry",
    args: [entryId],
  }) as unknown;
  entries.push({ entryId: entryId.toString(), entry });
}

printJson({
  registry,
  count: entries.length,
  entries,
});
