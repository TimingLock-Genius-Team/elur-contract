import { execSync } from "node:child_process";
import { encodeFunctionData, getAddress } from "viem";
import { artifacts } from "../config/artifacts.js";
import { defaultCurveParams } from "../config/params.js";
import { writeDeployment } from "../config/deployments.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { bytecodeOf, abiOf } from "../lib/artifacts.js";
import { printJson } from "../lib/json.js";
import { readProxyAdmin } from "../lib/proxy.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";

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
  const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: `deploy ${artifact}` });
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
  if (configured && process.env.DEPLOYMENT_NETWORK !== "anvil") {
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
  artifacts.localExternalDependency,
);
const positionManager = await envOrDeploy(
  "UNISWAP_V4_POSITION_MANAGER",
  "UNISWAP_V4_POSITION_MANAGER",
  artifacts.localExternalDependency,
);
const migrationTarget = await envOrDeploy(
  "MIGRATION_TARGET",
  "MIGRATION_TARGET",
  artifacts.localMigrationTarget,
);

const hookImplementation = await deploy(artifacts.hook);
const routerImplementation = await deploy(artifacts.router);
const factoryImplementation = await deploy(artifacts.factory);
const factoryInitializer = encodeFunctionData({
  abi: abiOf(artifacts.factory),
  functionName: "initialize",
  args: [
    feeRecipient,
    migrationTarget,
    routerImplementation,
    deployer,
    deployer,
  ],
});
const factory = await deploy(artifacts.transparentUpgradeableProxy, [
  factoryImplementation,
  deployer,
  factoryInitializer,
]);
const proxyAdmin = await readProxyAdmin(publicRpc, factory);
const setHookImplementationHash = await wallet.writeContract({
  address: factory,
  abi: abiOf(artifacts.factory),
  functionName: "setHookImplementation",
  args: [hookImplementation],
});
await waitForSuccessfulTransactionReceipt({
  client: publicRpc,
  hash: setHookImplementationHash,
  label: "set Hook implementation",
});
const hookRegistry = await deploy(artifacts.eulrHookRegistry, [deployer]);
const setHookRegistryHash = await wallet.writeContract({
  address: factory,
  abi: abiOf(artifacts.factory),
  functionName: "setHookRegistry",
  args: [hookRegistry],
});
await waitForSuccessfulTransactionReceipt({
  client: publicRpc,
  hash: setHookRegistryHash,
  label: "set Hook registry",
});
const setFactoryFeeCollectorHash = await wallet.writeContract({
  address: hookRegistry,
  abi: abiOf(artifacts.eulrHookRegistry),
  functionName: "setFeeCollector",
  args: [factory, true],
});
await waitForSuccessfulTransactionReceipt({
  client: publicRpc,
  hash: setFactoryFeeCollectorHash,
  label: "allow factory template fee collection",
});

let directV4LaunchFactory: `0x${string}` | undefined;
let directV4LiquidityTarget: `0x${string}` | undefined;
if (process.env.DIRECT_V4_LIQUIDITY_TARGET) {
  directV4LiquidityTarget = getAddress(process.env.DIRECT_V4_LIQUIDITY_TARGET);
  await requireCode("DIRECT_V4_LIQUIDITY_TARGET", directV4LiquidityTarget);
  directV4LaunchFactory = await deploy(artifacts.eulrDirectV4LaunchFactory, [
    hookRegistry,
    poolManager,
    directV4LiquidityTarget,
  ]);
  const setDirectFactoryFeeCollectorHash = await wallet.writeContract({
    address: hookRegistry,
    abi: abiOf(artifacts.eulrHookRegistry),
    functionName: "setFeeCollector",
    args: [directV4LaunchFactory, true],
  });
  await waitForSuccessfulTransactionReceipt({
    client: publicRpc,
    hash: setDirectFactoryFeeCollectorHash,
    label: "allow direct v4 factory template fee collection",
  });
}

writeDeployment({
  chainId,
  commit,
  deployedAt,
  deployer,
  factory,
  proxyAdmin,
  factoryImplementation,
  hookImplementation,
  routerImplementation,
  feeRecipient,
  uniswapV4PoolManager: poolManager,
  uniswapV4PositionManager: positionManager,
  migrationTarget,
  hookRegistry,
  ...(directV4LaunchFactory ? { directV4LaunchFactory } : {}),
  ...(directV4LiquidityTarget ? { directV4LiquidityTarget } : {}),
  curve: defaultCurveParams,
  createdTokens: [],
});

printJson({
  chainId,
  commit,
  deployedAt,
  deployer,
  factory,
  proxyAdmin,
  factoryImplementation,
  hookImplementation,
  routerImplementation,
  feeRecipient,
  poolManager,
  positionManager,
  migrationTarget,
  hookRegistry,
  ...(directV4LaunchFactory ? { directV4LaunchFactory } : {}),
  ...(directV4LiquidityTarget ? { directV4LiquidityTarget } : {}),
});
