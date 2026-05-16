import { getAddress } from "viem";
import { artifacts } from "../config/artifacts.js";
import { readDeployment, writeDeployment } from "../config/deployments.js";
import { abiOf } from "../lib/artifacts.js";
import { walletClient, publicClient } from "../lib/clients.js";
import { getArg, hasArg, optionalArg, optionalUint16Arg } from "../lib/args.js";
import { printJson } from "../lib/json.js";
import { extractCreatedTokenFromLogs, readOptionalFactoryRouterImplementation } from "../lib/contracts.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { parseOkb } from "../lib/units.js";
import { curveParamsForS, quoteBuyAtOkbCum } from "../lib/curve-quote.js";

const deployment = readDeployment();
const wallet = walletClient();
const publicRpc = publicClient();
const factoryAbi = abiOf(artifacts.factory);

const name = getArg("name");
const symbol = getArg("symbol");
const metadataURI = getArg("metadata-uri", "");
const socialURI = getArg("social-uri", "");
const buyWei = parseOkb(getArg("buy-okb"));
const curveSArg = optionalUint16Arg("curve-s", { min: 1, max: 1000 });

const defaultCurveS = Number(
  await publicRpc.readContract({
    address: deployment.factory,
    abi: factoryAbi,
    functionName: "DEFAULT_CURVE_S_OKB",
  }),
);
const curveSForQuote = curveSArg ?? defaultCurveS;

const recipient = getAddress(getArg("recipient", (await wallet.getAddresses())[0]));

function parseOptionalMinOutWei(): bigint | undefined {
  const raw = optionalArg("min-out");
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) {
    throw new Error("--min-out must be a wei amount (digits only)");
  }
  return BigInt(raw);
}

const minOutRaw = parseOptionalMinOutWei();
const slippageBps = optionalUint16Arg("slippage-bps", { min: 0, max: 9999 }) ?? 100;

let minOut: bigint;
if (minOutRaw !== undefined) {
  minOut = minOutRaw;
} else {
  const params = curveParamsForS(deployment.curve, curveSForQuote);
  const { tokensOut } = quoteBuyAtOkbCum(0n, buyWei, params);
  minOut = (tokensOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

if (minOut === 0n && !hasArg("allow-zero-min-out")) {
  throw new Error("Refusing minOut 0 without --allow-zero-min-out (use --min-out or increase --buy-okb)");
}

const hash =
  curveSArg === undefined
    ? await wallet.writeContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "createTokenAndBuy",
        args: [name, symbol, metadataURI, socialURI, minOut, recipient],
        value: buyWei,
      })
    : await wallet.writeContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "createTokenAndBuy",
        args: [name, symbol, metadataURI, socialURI, curveSArg, minOut, recipient],
        value: buyWei,
      });

const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: "createTokenAndBuy" });
const tokenInfo = extractCreatedTokenFromLogs(receipt.logs, deployment.factory);
const createdCurveS = tokenInfo.curveS ?? curveSForQuote;
const routerImplementation = await readOptionalFactoryRouterImplementation({
  client: publicRpc,
  factory: deployment.factory,
  abi: factoryAbi,
});

deployment.createdTokens.push({
  token: tokenInfo.token,
  hook: tokenInfo.hook,
  router: tokenInfo.router,
  curveS: createdCurveS,
  ...(routerImplementation ? { routerImplementation } : {}),
});
writeDeployment(deployment);

printJson({
  chainId: deployment.chainId,
  token: tokenInfo.token,
  hook: tokenInfo.hook,
  router: tokenInfo.router,
  routerImplementation,
  curveS: createdCurveS,
  minTokensOut: minOut.toString(),
  buyWei: buyWei.toString(),
  recipient,
  txHash: hash,
  blockNumber: receipt.blockNumber,
});
