import { ANVIL_CHAIN_ID } from "../config/chains.js";
import { publicClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";

const client = publicClient();
const chainId = await client.getChainId();

if (chainId !== ANVIL_CHAIN_ID) {
  throw new Error(`Expected Anvil chainId ${ANVIL_CHAIN_ID}, got ${chainId}`);
}

printJson({ chainId });
