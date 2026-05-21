import { getAddress } from "viem";
import { artifacts } from "../config/artifacts.js";
import { readDeployment, writeDeployment } from "../config/deployments.js";
import { abiOf, bytecodeOf } from "../lib/artifacts.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";
import { readProxyAdmin } from "../lib/proxy.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";

const deployment = readDeployment();
const wallet = walletClient();
const publicRpc = publicClient();

async function deployImplementation(artifact: string, label: string) {
  const hash = await wallet.deployContract({
    abi: abiOf(artifact),
    bytecode: bytecodeOf(artifact),
  });
  const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: `deploy ${label}` });
  if (!receipt.contractAddress) {
    throw new Error(`No contract address for ${label}`);
  }
  return getAddress(receipt.contractAddress);
}

const factoryImplementation = await deployImplementation(artifacts.factory, "EulrFactory implementation");
const hookImplementation = await deployImplementation(artifacts.hook, "EulrHook implementation");
const proxyAdmin = deployment.proxyAdmin ?? await readProxyAdmin(publicRpc, deployment.factory);

const upgradeHash = await wallet.writeContract({
  address: proxyAdmin,
  abi: abiOf(artifacts.proxyAdmin),
  functionName: "upgradeAndCall",
  args: [deployment.factory, factoryImplementation, "0x"],
});
const upgradeReceipt = await waitForSuccessfulTransactionReceipt({
  client: publicRpc,
  hash: upgradeHash,
  label: "upgrade Factory proxy for Hook architecture",
});

const setHookHash = await wallet.writeContract({
  address: deployment.factory,
  abi: abiOf(artifacts.factory),
  functionName: "setHookImplementation",
  args: [hookImplementation],
});
const setHookReceipt = await waitForSuccessfulTransactionReceipt({
  client: publicRpc,
  hash: setHookHash,
  label: "set future Hook implementation",
});

deployment.factoryImplementation = factoryImplementation;
deployment.hookImplementation = hookImplementation;
deployment.proxyAdmin = proxyAdmin;
writeDeployment(deployment);

printJson({
  chainId: deployment.chainId,
  factory: deployment.factory,
  proxyAdmin,
  factoryImplementation,
  hookImplementation,
  upgradeTxHash: upgradeHash,
  setHookImplementationTxHash: setHookHash,
  upgradeBlockNumber: upgradeReceipt.blockNumber,
  setHookImplementationBlockNumber: setHookReceipt.blockNumber,
});
