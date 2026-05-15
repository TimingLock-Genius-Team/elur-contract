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

async function deployImplementation() {
  const hash = await wallet.deployContract({
    abi: abiOf(artifacts.factory),
    bytecode: bytecodeOf(artifacts.factory),
  });
  const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: "deploy EulrFactory implementation" });
  if (!receipt.contractAddress) {
    throw new Error("No contract address for EulrFactory implementation");
  }
  return getAddress(receipt.contractAddress);
}

const implementation = await deployImplementation();
const proxyAdmin = deployment.proxyAdmin ?? await readProxyAdmin(publicRpc, deployment.factory);
const hash = await wallet.writeContract({
  address: proxyAdmin,
  abi: abiOf(artifacts.proxyAdmin),
  functionName: "upgradeAndCall",
  args: [deployment.factory, implementation, "0x"],
});
const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: "upgrade Factory proxy" });

deployment.factoryImplementation = implementation;
deployment.proxyAdmin = proxyAdmin;
writeDeployment(deployment);

printJson({
  chainId: deployment.chainId,
  factory: deployment.factory,
  proxyAdmin,
  factoryImplementation: implementation,
  txHash: hash,
  blockNumber: receipt.blockNumber,
});
