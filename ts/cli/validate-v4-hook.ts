import { getArg } from "../lib/args.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { bigintArg, bytes32Arg, registryAbi, registryAddress } from "../lib/v4-hook-registry-cli.js";

const wallet = walletClient();
const client = publicClient();
const registry = registryAddress();
const entryId = bigintArg(getArg("entry-id"), "entry-id");
const reportHash = bytes32Arg(getArg("report-hash"), "report-hash");
const reportURI = getArg("report-uri");
const stage = getArg("stage", "validated");
if (stage !== "validated" && stage !== "simulated") {
  throw new Error("--stage must be validated or simulated");
}

const hash = await wallet.writeContract({
  address: registry,
  abi: registryAbi,
  functionName: stage === "validated" ? "markValidated" : "markSimulated",
  args: [entryId, reportHash, reportURI],
});
const receipt = await waitForSuccessfulTransactionReceipt({ client, hash, label: `mark-${stage}` });

printJson({
  registry,
  entryId: entryId.toString(),
  stage,
  reportHash,
  reportURI,
  txHash: hash,
  blockNumber: receipt.blockNumber,
});
