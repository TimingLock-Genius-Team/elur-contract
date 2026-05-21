import { artifacts } from "../config/artifacts.js";
import { readDeployment, writeDeployment } from "../config/deployments.js";
import { abiOf } from "../lib/artifacts.js";
import { walletClient, publicClient } from "../lib/clients.js";
import { getArg, optionalUint16Arg } from "../lib/args.js";
import { printJson } from "../lib/json.js";
import {
  extractCreatedTokenFromLogs,
  readOptionalFactoryHookImplementation,
  readOptionalFactoryRouterImplementation,
} from "../lib/contracts.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";

const deployment = readDeployment();
const wallet = walletClient();
const publicRpc = publicClient();
const factoryAbi = abiOf(artifacts.factory);

const name = getArg("name");
const symbol = getArg("symbol");
const metadataURI = getArg("metadata-uri", "");
const socialURI = getArg("social-uri", "");
const curveS = optionalUint16Arg("curve-s", { min: 1, max: 1000 });
const feeBps = optionalUint16Arg("fee-bps", { min: 0, max: 10_000 });
const burnTaxMinBps = optionalUint16Arg("burn-tax-min-bps", { min: 0, max: 10_000 });
const burnTaxMaxBps = optionalUint16Arg("burn-tax-max-bps", { min: 0, max: 10_000 });
const hasCustomTax = feeBps !== undefined || burnTaxMinBps !== undefined || burnTaxMaxBps !== undefined;
const defaultCurveS = Number(
  await publicRpc.readContract({
    address: deployment.factory,
    abi: factoryAbi,
    functionName: "DEFAULT_CURVE_S_OKB",
  }),
);
const curveSForCreate = curveS ?? defaultCurveS;
const feeBpsForCreate = feeBps ?? deployment.curve.feeBps;
const burnTaxMinBpsForCreate = burnTaxMinBps ?? deployment.curve.burnTaxMinBps;
const burnTaxMaxBpsForCreate = burnTaxMaxBps ?? deployment.curve.burnTaxMaxBps;
if (burnTaxMinBpsForCreate > burnTaxMaxBpsForCreate) {
  throw new Error("--burn-tax-min-bps must be less than or equal to --burn-tax-max-bps");
}
const createTokenArgs = hasCustomTax
  ? [
      name,
      symbol,
      metadataURI,
      socialURI,
      curveSForCreate,
      feeBpsForCreate,
      burnTaxMinBpsForCreate,
      burnTaxMaxBpsForCreate,
    ] as const
  : curveS === undefined
    ? [name, symbol, metadataURI, socialURI] as const
    : [name, symbol, metadataURI, socialURI, curveS] as const;

const hash = await wallet.writeContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "createToken",
  args: createTokenArgs,
});
const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: "createToken" });
const tokenInfo = extractCreatedTokenFromLogs(receipt.logs, deployment.factory);
const createdCurveS = tokenInfo.curveS ?? curveSForCreate;
const routerImplementation = await readOptionalFactoryRouterImplementation({
  client: publicRpc,
  factory: deployment.factory,
  abi: factoryAbi,
});
const hookImplementation = await readOptionalFactoryHookImplementation({
  client: publicRpc,
  factory: deployment.factory,
  abi: factoryAbi,
});
deployment.createdTokens.push({
  token: tokenInfo.token,
  hook: tokenInfo.hook,
  router: tokenInfo.router,
  curveS: createdCurveS,
  ...(hasCustomTax
    ? {
        feeBps: feeBpsForCreate,
        burnTaxMinBps: burnTaxMinBpsForCreate,
        burnTaxMaxBps: burnTaxMaxBpsForCreate,
      }
    : {}),
  ...(hookImplementation ? { hookImplementation } : {}),
  ...(routerImplementation ? { routerImplementation } : {}),
});
writeDeployment(deployment);

printJson({
  chainId: deployment.chainId,
  token: tokenInfo.token,
  hook: tokenInfo.hook,
  router: tokenInfo.router,
  hookImplementation,
  routerImplementation,
  curveS: createdCurveS,
  ...(hasCustomTax
    ? {
        feeBps: feeBpsForCreate,
        burnTaxMinBps: burnTaxMinBpsForCreate,
        burnTaxMaxBps: burnTaxMaxBpsForCreate,
      }
    : {}),
  txHash: hash,
  blockNumber: receipt.blockNumber,
});
