import { knownChainIdForNetwork } from "../config/chains.js";
import { deploymentNetwork } from "../config/deployments.js";
import { publicClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";

const network = deploymentNetwork();
const expectedChainId = knownChainIdForNetwork(network);
if (expectedChainId === undefined) {
  throw new Error(`Unsupported deploy network ${network}`);
}

const client = publicClient();
const chainId = await client.getChainId();

if (chainId !== expectedChainId) {
  throw new Error(`Expected ${network} chainId ${expectedChainId}, got ${chainId}`);
}

printJson({ network, chainId });
