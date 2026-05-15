import { getAddress } from "viem";
import { artifacts } from "../config/artifacts.js";
import { readDeployment, writeDeployment } from "../config/deployments.js";
import { hasArg, optionalArg } from "../lib/args.js";
import { abiOf, bytecodeOf } from "../lib/artifacts.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";
import { readProxyAdmin } from "../lib/proxy.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { applyRouterImplementationMetadata, resolveRouterUpgradeTargets } from "../lib/upgrades.js";

const deployment = readDeployment();
const wallet = walletClient();
const publicRpc = publicClient();
const routerArg = optionalArg("router");
const upgradeAll = hasArg("all");
const targets = resolveRouterUpgradeTargets(deployment, { router: routerArg, all: upgradeAll });

async function deployImplementation() {
  const hash = await wallet.deployContract({
    abi: abiOf(artifacts.router),
    bytecode: bytecodeOf(artifacts.router),
  });
  const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: "deploy EulrRouter implementation" });
  if (!receipt.contractAddress) {
    throw new Error("No contract address for EulrRouter implementation");
  }
  return getAddress(receipt.contractAddress);
}

async function upgradeRouter(router: `0x${string}`, implementation: `0x${string}`) {
  const proxyAdmin = await readProxyAdmin(publicRpc, router);
  const hash = await wallet.writeContract({
    address: proxyAdmin,
    abi: abiOf(artifacts.proxyAdmin),
    functionName: "upgradeAndCall",
    args: [router, implementation, "0x"],
  });
  const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: `upgrade Router ${router}` });
  return { router, proxyAdmin, txHash: hash, blockNumber: receipt.blockNumber };
}

const implementation = await deployImplementation();
const upgrades = [];
for (const router of targets.routers) {
  upgrades.push(await upgradeRouter(router, implementation));
}

if (targets.updateFactoryDefault) {
  const hash = await wallet.writeContract({
    address: deployment.factory,
    abi: abiOf(artifacts.factory),
    functionName: "setRouterImplementation",
    args: [implementation],
  });
  await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: "set future Router implementation" });
}

applyRouterImplementationMetadata(deployment, {
  routers: targets.routers,
  implementation,
  updateFactoryDefault: targets.updateFactoryDefault,
});
writeDeployment(deployment);

printJson({
  chainId: deployment.chainId,
  routerImplementation: implementation,
  upgradedRouters: upgrades,
});
