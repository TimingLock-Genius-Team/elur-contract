import { getAddress } from "viem";
import { publicClient, walletClient } from "../lib/clients.js";
import { bytecodeOf, abiOf } from "../lib/artifacts.js";
import { writeDeployment } from "../lib/deployments.js";
import { printJson } from "../lib/json.js";

const wallet = walletClient();
const publicRpc = publicClient();

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

const chainId = await publicRpc.getChainId();

const feeRecipient = getAddress(
  process.env.TEAM_MULTISIG ?? (await wallet.getAddresses())[0],
);
const sat1HookDeployer = getAddress(
  process.env.SAT1_HOOK_DEPLOYER ?? (await deploy("LocalExternalDependency.sol/LocalExternalDependency.json")),
);
const poolManager = getAddress(
  process.env.UNISWAP_V4_POOL_MANAGER ?? (await deploy("LocalExternalDependency.sol/LocalExternalDependency.json")),
);
const positionManager = getAddress(
  process.env.UNISWAP_V4_POSITION_MANAGER ?? (await deploy("LocalExternalDependency.sol/LocalExternalDependency.json")),
);
const migrationTarget = getAddress(
  process.env.MIGRATION_TARGET ?? (await deploy("LocalMigrationTarget.sol/LocalMigrationTarget.json")),
);

const factory = await deploy("SatpadFactory.sol/SatpadFactory.json", [
  feeRecipient,
  sat1HookDeployer,
  poolManager,
  positionManager,
  migrationTarget,
]);

writeDeployment({
  chainId,
  factory,
  feeRecipient,
  sat1HookDeployer,
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

printJson({ chainId, factory, feeRecipient, sat1HookDeployer, poolManager, positionManager, migrationTarget });
