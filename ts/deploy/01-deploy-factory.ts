import { execSync } from "node:child_process";
import { getAddress } from "viem";
import { publicClient, walletClient } from "../lib/clients.js";
import { bytecodeOf, abiOf } from "../lib/artifacts.js";
import { writeDeployment } from "../lib/deployments.js";
import { printJson } from "../lib/json.js";

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

async function deploy(artifact: string, args: readonly unknown[] = []) {
  const hash = await wallet.deployContract({
    abi: abiOf(artifact),
    bytecode: bytecodeOf(artifact),
    args,
  });
  const receipt = await publicRpc.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error(`No contract address for ${artifact}`);
  }
  return getAddress(receipt.contractAddress);
}

async function requireCode(label: string, address: `0x${string}`) {
  const code = await publicRpc.getCode({ address });
  if (!code || code === "0x") {
    throw new Error(`${label} has no code at ${address}`);
  }
}

async function envOrDeploy(label: string, envName: string, localArtifact: string) {
  const configured = process.env[envName];
  if (configured) {
    const address = getAddress(configured);
    await requireCode(label, address);
    return address;
  }

  return deploy(localArtifact);
}

const chainId = await publicRpc.getChainId();
const deployer = getAddress((await wallet.getAddresses())[0]);
const commit = currentCommit();
const deployedAt = new Date().toISOString();

const feeRecipient = getAddress(
  process.env.TEAM_MULTISIG ?? deployer,
);
const poolManager = await envOrDeploy(
  "UNISWAP_V4_POOL_MANAGER",
  "UNISWAP_V4_POOL_MANAGER",
  "LocalExternalDependency.sol/LocalExternalDependency.json",
);
const positionManager = await envOrDeploy(
  "UNISWAP_V4_POSITION_MANAGER",
  "UNISWAP_V4_POSITION_MANAGER",
  "LocalExternalDependency.sol/LocalExternalDependency.json",
);
const migrationTarget = await envOrDeploy(
  "MIGRATION_TARGET",
  "MIGRATION_TARGET",
  "LocalMigrationTarget.sol/LocalMigrationTarget.json",
);

const factory = await deploy("SatpadFactory.sol/SatpadFactory.json", [
  feeRecipient,
  migrationTarget,
]);

writeDeployment({
  chainId,
  commit,
  deployedAt,
  deployer,
  factory,
  feeRecipient,
  uniswapV4PoolManager: poolManager,
  uniswapV4PositionManager: positionManager,
  migrationTarget,
  curve: {
    k: "21000000000000000000000000",
    s: "100000000000000000000",
    feeBps: 30,
    selfDeprecationBps: 9900,
    maxBuyOkb: "10000000000000000000",
  },
  createdTokens: [],
});

printJson({
  chainId,
  commit,
  deployedAt,
  deployer,
  factory,
  feeRecipient,
  poolManager,
  positionManager,
  migrationTarget,
});
