import "dotenv/config";
import { createPublicClient, http } from "viem";
import { knownChainIdForNetwork, rpcUrlFromEnv } from "../config/chains.js";
import { deploymentNetwork } from "../config/deployments.js";
import {
  migrationTargetDeploymentPath,
  readMigrationTargetDeployment,
} from "../config/migration-target-deployments.js";
import type { DeploymentCodeReader } from "../lib/deployment-doctor.js";
import { optionalArg } from "../lib/args.js";
import { printJson } from "../lib/json.js";
import { redactDiagnostics, redactKnownSecrets } from "../lib/redaction.js";
import {
  doctorMigrationTargetDeployment,
} from "../lib/migration-target-deployment.js";

function rpcUrlForNetwork(network: string): string | undefined {
  return optionalArg("rpc-url") ?? rpcUrlFromEnv(network);
}

function expectedChainIdForNetwork(network: string): number | undefined {
  const configured = optionalArg("chain-id");
  if (!configured) {
    return knownChainIdForNetwork(network);
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

function redactionSecrets(rpcUrl: string | undefined): Array<string | undefined> {
  return [rpcUrl, process.env.RPC_URL, process.env.XLAYER_RPC_URL, process.env.HASHKEYTEST_RPC_URL, process.env.ANVIL_RPC_URL];
}

async function main(): Promise<void> {
  let network: string | undefined;
  let path: string | undefined;
  let rpcUrl: string | undefined;
  let expectedChainId: number | undefined;

  try {
    network = deploymentNetwork();
    path = migrationTargetDeploymentPath(network);
    rpcUrl = rpcUrlForNetwork(network);
    expectedChainId = expectedChainIdForNetwork(network);

    const result = redactDiagnostics(
      await doctorMigrationTargetDeployment(readMigrationTargetDeployment(network), {
        expectedChainId,
        codeReader: rpcUrl ? codeReaderForRpc(rpcUrl) : undefined,
      }),
      redactionSecrets(rpcUrl),
    );

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
    const message = redactKnownSecrets(
      error instanceof Error ? error.message : String(error),
      redactionSecrets(rpcUrl),
    );
    printJson({
      ...(network ? { network } : {}),
      ...(path ? { path } : {}),
      ...(expectedChainId !== undefined ? { expectedChainId } : {}),
      ...(network ? { rpcChecked: Boolean(rpcUrl) } : {}),
      ok: false,
      errors: [message],
      warnings: [],
    });
    process.exitCode = 1;
  }
}

await main();
