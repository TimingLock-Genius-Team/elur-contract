import { getAddress } from "viem";
import { getArg, optionalArg } from "../lib/args.js";
import { publicClient, walletClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import {
  bigintArg,
  launchModesArg,
  numberArg,
  registryAbi,
  registryAddress,
} from "../lib/v4-hook-registry-cli.js";

const wallet = walletClient();
const client = publicClient();
const registry = registryAddress();
const entryId = bigintArg(getArg("entry-id"), "entry-id");
const action = getArg("action", "approve");

let hash: `0x${string}`;
if (action === "approve") {
  const oneTimeFee = bigintArg(getArg("one-time-fee-wei", "0"), "one-time-fee-wei");
  const creatorFeeRecipient = optionalArg("creator-fee-recipient");
  const protocolFeeRecipient = optionalArg("protocol-fee-recipient");
  hash = await wallet.writeContract({
    address: registry,
    abi: registryAbi,
    functionName: "approveHook",
    args: [entryId, {
      launchModes: launchModesArg(getArg("launch-modes", "both")),
      feeConfig: {
        feeCurrency: optionalArg("fee-currency") ? getAddress(getArg("fee-currency")) : "0x0000000000000000000000000000000000000000",
        oneTimeFee,
        creatorFeeRecipient: creatorFeeRecipient ? getAddress(creatorFeeRecipient) : "0x0000000000000000000000000000000000000000",
        protocolFeeRecipient: protocolFeeRecipient ? getAddress(protocolFeeRecipient) : "0x0000000000000000000000000000000000000000",
        protocolFeeBps: numberArg(getArg("protocol-fee-bps", "0"), "protocol-fee-bps"),
      },
    }],
  });
} else if (action === "suspend" || action === "deprecate" || action === "reject") {
  const functionName = action === "suspend" ? "suspendHook" : action === "deprecate" ? "deprecateHook" : "rejectHook";
  hash = await wallet.writeContract({
    address: registry,
    abi: registryAbi,
    functionName,
    args: [entryId, getArg("reason", action)],
  });
} else {
  throw new Error("--action must be approve, suspend, deprecate, or reject");
}

const receipt = await waitForSuccessfulTransactionReceipt({ client, hash, label: `hook-${action}` });
printJson({
  registry,
  entryId: entryId.toString(),
  action,
  txHash: hash,
  blockNumber: receipt.blockNumber,
});
