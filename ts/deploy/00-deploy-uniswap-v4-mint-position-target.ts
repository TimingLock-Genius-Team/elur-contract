import { execSync } from "node:child_process";
import { getAddress } from "viem";
import { artifacts } from "../config/artifacts.js";
import {
  migrationTargetDeploymentPath,
  writeMigrationTargetDeployment,
} from "../config/migration-target-deployments.js";
import { abiOf, bytecodeOf } from "../lib/artifacts.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";

const artifact = artifacts.uniswapV4MintPositionTarget;
const wallet = walletClient();
const publicRpc = publicClient();

function currentCommit(): string {
  if (process.env.GIT_COMMIT) {
    return process.env.GIT_COMMIT;
  }

  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function requiredAddressEnv(envName: string): `0x${string}` {
  const value = process.env[envName];
  if (!value) {
    throw new Error(`${envName} is required`);
  }

  return getAddress(value);
}

async function requireCode(label: string, address: `0x${string}`): Promise<void> {
  const code = await publicRpc.getCode({ address });
  if (!code || code === "0x") {
    throw new Error(`${label} has no code at ${address}`);
  }
}

const poolManager = requiredAddressEnv("UNISWAP_V4_POOL_MANAGER");
const positionManager = requiredAddressEnv("UNISWAP_V4_POSITION_MANAGER");
const lpRecipient = requiredAddressEnv("LP_RECIPIENT");

await requireCode("UNISWAP_V4_POOL_MANAGER", poolManager);
await requireCode("UNISWAP_V4_POSITION_MANAGER", positionManager);

const chainId = await publicRpc.getChainId();
const deployer = getAddress((await wallet.getAddresses())[0]);
const commit = currentCommit();
const deployedAt = process.env.DEPLOYED_AT ?? new Date().toISOString();

const hash = await wallet.deployContract({
  abi: abiOf(artifact),
  bytecode: bytecodeOf(artifact),
  args: [poolManager, positionManager, lpRecipient],
});
const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: `deploy ${artifact}` });
if (!receipt.contractAddress) {
  throw new Error(`No contract address for ${artifact}`);
}

const migrationTarget = getAddress(receipt.contractAddress);
await requireCode("UniswapV4MintPositionTarget", migrationTarget);

const deployment = {
  chainId,
  commit,
  deployedAt,
  deployer,
  migrationTarget,
  transactionHash: receipt.transactionHash,
  uniswapV4PoolManager: poolManager,
  uniswapV4PositionManager: positionManager,
  lpRecipient,
};

writeMigrationTargetDeployment(deployment);

printJson({
  ...deployment,
  path: migrationTargetDeploymentPath(),
});
