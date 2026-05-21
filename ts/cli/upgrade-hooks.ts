import { getAddress } from "viem";
import { artifacts } from "../config/artifacts.js";
import { readDeployment, writeDeployment } from "../config/deployments.js";
import { hasArg, optionalArg } from "../lib/args.js";
import { abiOf, bytecodeOf } from "../lib/artifacts.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";
import { readProxyAdmin } from "../lib/proxy.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { applyHookImplementationMetadata, resolveHookUpgradeTargets } from "../lib/upgrades.js";

const deployment = readDeployment();
const wallet = walletClient();
const publicRpc = publicClient();
const hookArg = optionalArg("hook");
const upgradeAll = hasArg("all");
const targets = resolveHookUpgradeTargets(deployment, { hook: hookArg, all: upgradeAll });

async function deployImplementation() {
  const hash = await wallet.deployContract({
    abi: abiOf(artifacts.hook),
    bytecode: bytecodeOf(artifacts.hook),
  });
  const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: "deploy EulrHook implementation" });
  if (!receipt.contractAddress) {
    throw new Error("No contract address for EulrHook implementation");
  }
  return getAddress(receipt.contractAddress);
}

async function upgradeHook(hook: `0x${string}`, implementation: `0x${string}`) {
  const proxyAdmin = await readProxyAdmin(publicRpc, hook);
  const hash = await wallet.writeContract({
    address: proxyAdmin,
    abi: abiOf(artifacts.proxyAdmin),
    functionName: "upgradeAndCall",
    args: [hook, implementation, "0x"],
  });
  const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: `upgrade Hook ${hook}` });
  return { hook, proxyAdmin, txHash: hash, blockNumber: receipt.blockNumber };
}

const implementation = await deployImplementation();
const upgrades = [];
for (const hook of targets.hooks) {
  upgrades.push(await upgradeHook(hook, implementation));
}

if (targets.updateFactoryDefault) {
  const hash = await wallet.writeContract({
    address: deployment.factory,
    abi: abiOf(artifacts.factory),
    functionName: "setHookImplementation",
    args: [implementation],
  });
  await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: "set future Hook implementation" });
}

applyHookImplementationMetadata(deployment, {
  hooks: targets.hooks,
  implementation,
  updateFactoryDefault: targets.updateFactoryDefault,
});
writeDeployment(deployment);

printJson({
  chainId: deployment.chainId,
  hookImplementation: implementation,
  upgradedHooks: upgrades,
});
