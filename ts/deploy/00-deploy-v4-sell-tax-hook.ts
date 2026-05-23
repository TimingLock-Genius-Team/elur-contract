import { encodeDeployData, getAddress, keccak256, type Hex } from "viem";
import { artifacts } from "../config/artifacts.js";
import { abiOf, bytecodeOf } from "../lib/artifacts.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { mineCreate2HookAddress } from "../lib/v4-hook-miner.js";

const hookArtifact = artifacts.v4SellTaxHook;
const deployerArtifact = artifacts.v4SellTaxHookDeployer;
const wallet = walletClient();
const publicRpc = publicClient();

function requiredAddressEnv(envName: string): `0x${string}` {
  const value = process.env[envName];
  if (!value) {
    throw new Error(`${envName} is required`);
  }
  return getAddress(value);
}

function optionalAddressEnv(envName: string): `0x${string}` | undefined {
  const value = process.env[envName];
  return value ? getAddress(value) : undefined;
}

function uint16Env(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${envName} must be an integer between 0 and 10000`);
  }
  return value;
}

function int24Env(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < -(2 ** 23) || value > 2 ** 23 - 1) {
    throw new Error(`${envName} must fit int24`);
  }
  return value;
}

async function requireCode(label: string, address: `0x${string}`): Promise<void> {
  const code = await publicRpc.getCode({ address });
  if (!code || code === "0x") {
    throw new Error(`${label} has no code at ${address}`);
  }
}

const poolManager = requiredAddressEnv("UNISWAP_V4_POOL_MANAGER");
const owner = optionalAddressEnv("V4_SELL_TAX_HOOK_OWNER") ?? getAddress((await wallet.getAddresses())[0]);
const minTaxBps = uint16Env("V4_SELL_TAX_MIN_BPS", 100);
const maxTaxBps = uint16Env("V4_SELL_TAX_MAX_BPS", 1_000);
const taxLowTick = int24Env("V4_SELL_TAX_LOW_TICK", -887_220);
const taxHighTick = int24Env("V4_SELL_TAX_HIGH_TICK", 887_220);

await requireCode("UNISWAP_V4_POOL_MANAGER", poolManager);

const deployerHash = await wallet.deployContract({
  abi: abiOf(deployerArtifact),
  bytecode: bytecodeOf(deployerArtifact),
});
const deployerReceipt = await waitForSuccessfulTransactionReceipt({
  client: publicRpc,
  hash: deployerHash,
  label: `deploy ${deployerArtifact}`,
});
if (!deployerReceipt.contractAddress) {
  throw new Error(`No contract address for ${deployerArtifact}`);
}

const create2Deployer = getAddress(deployerReceipt.contractAddress);
const initCode = encodeDeployData({
  abi: abiOf(hookArtifact),
  bytecode: bytecodeOf(hookArtifact),
  args: [poolManager, owner, minTaxBps, maxTaxBps, taxLowTick, taxHighTick],
});
const mined = mineCreate2HookAddress({
  deployer: create2Deployer,
  initCodeHash: keccak256(initCode),
});

const deployHash = await wallet.writeContract({
  address: create2Deployer,
  abi: abiOf(deployerArtifact),
  functionName: "deploy",
  args: [mined.salt, initCode],
});
const deployReceipt = await waitForSuccessfulTransactionReceipt({
  client: publicRpc,
  hash: deployHash,
  label: `deploy ${hookArtifact}`,
});
await requireCode("EulrV4SellTaxHook", mined.address);

printJson({
  chainId: await publicRpc.getChainId(),
  create2Deployer,
  hook: mined.address,
  salt: mined.salt,
  iterations: mined.iterations.toString(),
  transactionHash: deployReceipt.transactionHash,
  poolManager,
  owner,
  minTaxBps,
  maxTaxBps,
  taxLowTick,
  taxHighTick,
  env: {
    XLAYER_V4_HOOKS: mined.address,
  },
} satisfies {
  chainId: number;
  create2Deployer: `0x${string}`;
  hook: `0x${string}`;
  salt: Hex;
  iterations: string;
  transactionHash: `0x${string}`;
  poolManager: `0x${string}`;
  owner: `0x${string}`;
  minTaxBps: number;
  maxTaxBps: number;
  taxLowTick: number;
  taxHighTick: number;
  env: { XLAYER_V4_HOOKS: `0x${string}` };
});
