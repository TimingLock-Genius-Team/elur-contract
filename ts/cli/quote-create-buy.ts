import { publicClient } from "../lib/clients.js";
import { getArg, optionalUint16Arg } from "../lib/args.js";
import { artifacts } from "../config/artifacts.js";
import { abiOf } from "../lib/artifacts.js";
import { readDeployment } from "../config/deployments.js";
import { printJson } from "../lib/json.js";
import { parseOkb } from "../lib/units.js";
import { curveParamsForS, quoteBuyAtOkbCum } from "../lib/curve-quote.js";

const deployment = readDeployment();
const client = publicClient();
const factoryAbi = abiOf(artifacts.factory);

const buyWei = parseOkb(getArg("buy-okb"));
const curveS =
  optionalUint16Arg("curve-s", { min: 1, max: 1000 }) ??
  Number(
    await client.readContract({
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "DEFAULT_CURVE_S_OKB",
    }),
  );

const params = curveParamsForS(deployment.curve, curveS);
const quote = quoteBuyAtOkbCum(0n, buyWei, params);
const slippageBps = optionalUint16Arg("slippage-bps", { min: 0, max: 9999 }) ?? 100;
const minTokensOut = (quote.tokensOut * BigInt(10_000 - slippageBps)) / 10_000n;

printJson({
  chainId: deployment.chainId,
  factory: deployment.factory,
  curveS,
  okbCum: "0",
  grossOkbIn: buyWei.toString(),
  feeWei: quote.fee.toString(),
  effectiveOkbWei: quote.effectiveOkbIn.toString(),
  tokensOut: quote.tokensOut.toString(),
  slippageBps,
  minTokensOut: minTokensOut.toString(),
});
