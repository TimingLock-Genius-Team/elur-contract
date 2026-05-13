import { createPublicClient, http } from "viem";
import { deploymentNetwork } from "../lib/deployments.js";
import type { DeploymentCodeReader } from "../lib/deployment-doctor.js";
import { printJson } from "../lib/json.js";
import {
  doctorMigrationTargetDeployment,
  migrationTargetDeploymentPath,
  readMigrationTargetDeployment,
} from "../lib/migration-target-deployment.js";

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
  if (!configured) {
    return knownNetworkChainIds[network];
  }

  const chainId = Number(configured);
  if (!/^[1-9]\d*$/.test(configured) || !Number.isSafeInteger(chainId)) {
    throw new Error("--chain-id must be a positive integer");
  }

  return chainId;
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
  const path = migrationTargetDeploymentPath(network);
  let rpcUrl: string | undefined;
  let expectedChainId: number | undefined;

  try {
    rpcUrl = rpcUrlForNetwork(network);
    expectedChainId = expectedChainIdForNetwork(network);

    const result = await doctorMigrationTargetDeployment(readMigrationTargetDeployment(network), {
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
