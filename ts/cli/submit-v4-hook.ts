import { getAddress } from "viem";
import { readDeployment } from "../config/deployments.js";
import { getArg, optionalArg } from "../lib/args.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import {
  bigintArg,
  bytes32Arg,
  numberArg,
  optionalBytes32Arg,
  permissionMaskArg,
  registryAbi,
  registryAddress,
} from "../lib/v4-hook-registry-cli.js";

const deployment = readDeployment();
const wallet = walletClient();
const client = publicClient();
const registry = registryAddress();

const hook = getAddress(getArg("hook"));
const author = getAddress(optionalArg("author") ?? wallet.account.address);
const permissionMask = permissionMaskArg(getArg("permission-mask"));
const targetChainId = Number(optionalArg("chain-id") ?? deployment.chainId);
const recommendedPoolFee = numberArg(getArg("pool-fee", "3000"), "pool-fee");
const recommendedTickSpacing = numberArg(getArg("tick-spacing", "60"), "tick-spacing");
const riskLabelMask = bigintArg(getArg("risk-label-mask", "0"), "risk-label-mask");

const hash = await wallet.writeContract({
  address: registry,
  abi: registryAbi,
  functionName: "submitHook",
  args: [{
    hook,
    author,
    targetChainId: BigInt(targetChainId),
    permissionMask,
    metadataURI: getArg("metadata-uri"),
    metadataHash: bytes32Arg(getArg("metadata-hash"), "metadata-hash"),
    sourceMetadataHash: optionalBytes32Arg("source-metadata-hash"),
    artifactMetadataHash: optionalBytes32Arg("artifact-metadata-hash"),
    constructorArgsHash: optionalBytes32Arg("constructor-args-hash"),
    exampleHookDataHash: optionalBytes32Arg("example-hook-data-hash"),
    recommendedPoolFee,
    recommendedTickSpacing,
    riskLabelMask,
  }],
});

const receipt = await waitForSuccessfulTransactionReceipt({ client, hash, label: "submitHook" });
const entryId = await client.readContract({
  address: registry,
  abi: registryAbi,
  functionName: "nextHookEntryId",
}) as bigint;

printJson({
  chainId: deployment.chainId,
  registry,
  entryId: entryId.toString(),
  hook,
  author,
  permissionMask,
  txHash: hash,
  blockNumber: receipt.blockNumber,
});
