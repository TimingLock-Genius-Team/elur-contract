import { getAddress } from "viem";
import { artifacts } from "../config/artifacts.js";
import { readDeployment, writeDeployment } from "../config/deployments.js";
import { abiOf } from "../lib/artifacts.js";
import { walletClient, publicClient } from "../lib/clients.js";
import { getArg, hasArg, optionalArg, optionalUint16Arg } from "../lib/args.js";
import { printJson } from "../lib/json.js";
import {
  extractCreatedTokenFromLogs,
  extractV4MigrationProfileBindingFromLogs,
  readOptionalFactoryHookImplementation,
  readOptionalFactoryRouterImplementation,
} from "../lib/contracts.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { parseOkb } from "../lib/units.js";
import { curveParamsForS, quoteBuyAtOkbCum } from "../lib/curve-quote.js";
import { hookEntryFeeConfig, registryAbi } from "../lib/v4-hook-registry-cli.js";

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
const feeBpsArg = optionalUint16Arg("fee-bps", { min: 0, max: 10_000 });
const burnTaxMinBpsArg = optionalUint16Arg("burn-tax-min-bps", { min: 0, max: 10_000 });
const burnTaxMaxBpsArg = optionalUint16Arg("burn-tax-max-bps", { min: 0, max: 10_000 });
const v4MigrationProfileId = parseOptionalProfileId();
const hasCustomTax = feeBpsArg !== undefined || burnTaxMinBpsArg !== undefined || burnTaxMaxBpsArg !== undefined;
if (v4MigrationProfileId !== undefined && hasCustomTax) {
  throw new Error("--v4-migration-profile cannot be combined with custom curve tax flags yet");
}

const defaultCurveS = Number(
  await publicRpc.readContract({
    address: deployment.factory,
    abi: factoryAbi,
    functionName: "DEFAULT_CURVE_S_OKB",
  }),
);
const curveSForQuote = curveSArg ?? defaultCurveS;
const feeBpsForCreate = feeBpsArg ?? deployment.curve.feeBps;
const burnTaxMinBpsForCreate = burnTaxMinBpsArg ?? deployment.curve.burnTaxMinBps;
const burnTaxMaxBpsForCreate = burnTaxMaxBpsArg ?? deployment.curve.burnTaxMaxBps;
if (burnTaxMinBpsForCreate > burnTaxMaxBpsForCreate) {
  throw new Error("--burn-tax-min-bps must be less than or equal to --burn-tax-max-bps");
}

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
const nativeTemplateFee = await nativeTemplateFeeForProfile(v4MigrationProfileId);

let minOut: bigint;
if (minOutRaw !== undefined) {
  minOut = minOutRaw;
} else {
  const params = curveParamsForS(deployment.curve, curveSForQuote);
  params.feeBps = feeBpsForCreate;
  params.burnTaxMinBps = burnTaxMinBpsForCreate;
  params.burnTaxMaxBps = burnTaxMaxBpsForCreate;
  const { tokensOut } = quoteBuyAtOkbCum(0n, buyWei, params);
  minOut = (tokensOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

if (minOut === 0n && !hasArg("allow-zero-min-out")) {
  throw new Error("Refusing minOut 0 without --allow-zero-min-out (use --min-out or increase --buy-okb)");
}

const hash =
  v4MigrationProfileId !== undefined
    ? await wallet.writeContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "createTokenAndBuyWithV4MigrationProfile",
        args: [name, symbol, metadataURI, socialURI, curveSForQuote, v4MigrationProfileId, minOut, recipient],
        value: buyWei + nativeTemplateFee,
      })
    : hasCustomTax
    ? await wallet.writeContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "createTokenAndBuy",
        args: [
          name,
          symbol,
          metadataURI,
          socialURI,
          curveSForQuote,
          feeBpsForCreate,
          burnTaxMinBpsForCreate,
          burnTaxMaxBpsForCreate,
          minOut,
          recipient,
        ],
        value: buyWei,
      })
    : curveSArg === undefined
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
const v4Binding = v4MigrationProfileId === undefined
  ? undefined
  : extractV4MigrationProfileBindingFromLogs(receipt.logs, deployment.factory);
const createdCurveS = tokenInfo.curveS ?? curveSForQuote;
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
  ...(v4Binding
    ? {
        v4MigrationProfileId: v4Binding.profileId,
        v4Hooks: v4Binding.hooks,
        v4MigrationTarget: v4Binding.migrationTarget,
        launchMode: "CURVE_FIRST_V4_HOOK_MIGRATION" as const,
      }
    : {}),
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
  ...(v4Binding
    ? {
        v4MigrationProfileId: v4Binding.profileId,
        v4Hooks: v4Binding.hooks,
        v4MigrationTarget: v4Binding.migrationTarget,
        launchMode: "CURVE_FIRST_V4_HOOK_MIGRATION",
      }
    : {}),
  minTokensOut: minOut.toString(),
  buyWei: buyWei.toString(),
  recipient,
  txHash: hash,
  blockNumber: receipt.blockNumber,
});

function parseOptionalProfileId(): bigint | undefined {
  const value = optionalArg("v4-migration-profile");
  if (value === undefined) {
    return undefined;
  }
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("--v4-migration-profile must be a positive integer profile id");
  }
  return BigInt(value);
}

async function nativeTemplateFeeForProfile(profileId: bigint | undefined): Promise<bigint> {
  if (profileId === undefined || !deployment.hookRegistry) {
    return 0n;
  }
  const profile = await publicRpc.readContract({
    address: deployment.factory,
    abi: factoryAbi,
    functionName: "getV4MigrationProfile",
    args: [profileId],
  }) as { hookRegistryEntryId?: bigint } | readonly unknown[];
  let hookRegistryEntryId: bigint | undefined;
  if (Array.isArray(profile)) {
    hookRegistryEntryId = profile[0] as bigint;
  } else {
    hookRegistryEntryId = (profile as { hookRegistryEntryId?: bigint }).hookRegistryEntryId;
  }
  if (!hookRegistryEntryId || hookRegistryEntryId === 0n) {
    return 0n;
  }
  const entry = await publicRpc.readContract({
    address: deployment.hookRegistry,
    abi: registryAbi,
    functionName: "getHookEntry",
    args: [hookRegistryEntryId],
  }) as { feeConfig?: { feeCurrency: `0x${string}`; oneTimeFee: bigint } } | readonly unknown[];
  const feeConfig = hookEntryFeeConfig(entry);
  if (!feeConfig || feeConfig.feeCurrency !== "0x0000000000000000000000000000000000000000") {
    return 0n;
  }
  return feeConfig.oneTimeFee;
}
