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
const feeBps = optionalUint16Arg("fee-bps", { min: 0, max: 10_000 }) ?? deployment.curve.feeBps;
const burnTaxMinBps =
  optionalUint16Arg("burn-tax-min-bps", { min: 0, max: 10_000 }) ?? deployment.curve.burnTaxMinBps;
const burnTaxMaxBps =
  optionalUint16Arg("burn-tax-max-bps", { min: 0, max: 10_000 }) ?? deployment.curve.burnTaxMaxBps;
if (burnTaxMinBps > burnTaxMaxBps) {
  throw new Error("--burn-tax-min-bps must be less than or equal to --burn-tax-max-bps");
}

const params = curveParamsForS(deployment.curve, curveS);
params.feeBps = feeBps;
params.burnTaxMinBps = burnTaxMinBps;
params.burnTaxMaxBps = burnTaxMaxBps;
const quote = quoteBuyAtOkbCum(0n, buyWei, params);
const slippageBps = optionalUint16Arg("slippage-bps", { min: 0, max: 9999 }) ?? 100;
const minTokensOut = (quote.tokensOut * BigInt(10_000 - slippageBps)) / 10_000n;

printJson({
  chainId: deployment.chainId,
  factory: deployment.factory,
  curveS,
  feeBps,
  burnTaxMinBps,
  burnTaxMaxBps,
  okbCum: "0",
  grossOkbIn: buyWei.toString(),
  feeWei: quote.fee.toString(),
  effectiveOkbWei: quote.effectiveOkbIn.toString(),
  burnTaxBps: quote.burnTaxBps,
  grossTokensOut: quote.grossTokensOut.toString(),
  burnTaxTokens: quote.burnTaxTokens.toString(),
  tokensOut: quote.tokensOut.toString(),
  slippageBps,
  minTokensOut: minTokensOut.toString(),
});
