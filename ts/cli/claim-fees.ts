import { getAddress } from "viem";
import { publicClient, walletClient } from "../lib/clients.js";
import { getArg } from "../lib/args.js";
import { hookAbi, resolveTokenInfo } from "../lib/contracts.js";
import { printJson } from "../lib/json.js";

const wallet = walletClient();
const client = publicClient();
const info = await resolveTokenInfo();
const recipient = getAddress(getArg("recipient", (await wallet.getAddresses())[0]));

const claimableBefore = await client.readContract({
  address: info.hook,
  abi: hookAbi,
  functionName: "claimableFeeOkb",
});

const hash = await wallet.writeContract({
  address: info.hook,
  abi: hookAbi,
  functionName: "claimFees",
  args: [recipient],
});
const receipt = await client.waitForTransactionReceipt({ hash });

const claimableAfter = await client.readContract({
  address: info.hook,
  abi: hookAbi,
  functionName: "claimableFeeOkb",
});

printJson({
  chainId: info.deployment.chainId,
  token: info.token,
  hook: info.hook,
  recipient,
  claimed: claimableBefore,
  claimableAfter,
  txHash: hash,
  blockNumber: receipt.blockNumber,
});
