import { createPublicClient, http } from "viem";
import { doctorDeployment, type DeploymentCodeReader } from "../lib/deployment-doctor.js";
import { deploymentNetwork, deploymentPath, readDeployment } from "../lib/deployments.js";
import { printJson } from "../lib/json.js";

const knownNetworkChainIds: Record<string, number> = {
  anvil: 31337,
  "forge-local": 31337,
  xlayer: 196,
};

function optionalArg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function envKeyForNetwork(network: string): string {
  return `${network.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_RPC_URL`;
}

function rpcUrlForNetwork(network: string): string | undefined {
  return optionalArg("rpc-url") ?? process.env.RPC_URL ?? process.env[envKeyForNetwork(network)];
}

function expectedChainIdForNetwork(network: string): number | undefined {
  const configured = optionalArg("chain-id");
  return configured ? Number(configured) : knownNetworkChainIds[network];
}

function codeReaderForRpc(rpcUrl: string): DeploymentCodeReader {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return {
    getChainId: () => client.getChainId(),
    getCode: ({ address }) => client.getCode({ address }),
  };
}

async function main(): Promise<void> {
  const network = deploymentNetwork();
  const path = deploymentPath(network);
  const rpcUrl = rpcUrlForNetwork(network);
  const expectedChainId = expectedChainIdForNetwork(network);

  try {
    const result = await doctorDeployment(readDeployment(network), {
      expectedChainId,
      codeReader: rpcUrl ? codeReaderForRpc(rpcUrl) : undefined,
    });

    printJson({
      network,
      path,
      expectedChainId,
      rpcChecked: Boolean(rpcUrl),
      ...result,
    });

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printJson({
      network,
      path,
      expectedChainId,
      rpcChecked: Boolean(rpcUrl),
      ok: false,
      errors: [message],
      warnings: [],
    });
    process.exitCode = 1;
  }
}

await main();
