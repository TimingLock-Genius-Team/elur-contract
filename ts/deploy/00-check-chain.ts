import { publicClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";

const client = publicClient();
const chainId = await client.getChainId();

if (chainId !== 31337) {
  throw new Error(`Expected Anvil chainId 31337, got ${chainId}`);
}

printJson({ chainId });
