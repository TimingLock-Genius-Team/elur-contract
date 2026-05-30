import { artifacts } from "../config/artifacts.js";
import { readDeployment, writeDeployment } from "../config/deployments.js";
import { abiOf } from "../lib/artifacts.js";
import { walletClient, publicClient } from "../lib/clients.js";
import { getArg, optionalArg, optionalUint16Arg } from "../lib/args.js";
import { printJson } from "../lib/json.js";
import {
  extractCreatedTokenFromLogs,
  extractV4MigrationProfileBindingFromLogs,
  readOptionalFactoryHookImplementation,
  readOptionalFactoryRouterImplementation,
} from "../lib/contracts.js";
import { waitForSuccessfulTransactionReceipt } from "../lib/transactions.js";
import { hookEntryFeeConfig, registryAbi } from "../lib/v4-hook-registry-cli.js";

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
const v4MigrationProfileId = parseOptionalProfileId();
const hasCustomTax = feeBps !== undefined || burnTaxMinBps !== undefined || burnTaxMaxBps !== undefined;
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
  : v4MigrationProfileId !== undefined
    ? [name, symbol, metadataURI, socialURI, curveSForCreate, v4MigrationProfileId] as const
  : curveS === undefined
    ? [name, symbol, metadataURI, socialURI] as const
    : [name, symbol, metadataURI, socialURI, curveS] as const;
const createValue = await nativeTemplateFeeForProfile(v4MigrationProfileId);

const hash = await wallet.writeContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: v4MigrationProfileId === undefined ? "createToken" : "createTokenWithV4MigrationProfile",
  args: createTokenArgs,
  value: createValue,
});
const receipt = await waitForSuccessfulTransactionReceipt({ client: publicRpc, hash, label: "createToken" });
const tokenInfo = extractCreatedTokenFromLogs(receipt.logs, deployment.factory);
const v4Binding = v4MigrationProfileId === undefined
  ? undefined
  : extractV4MigrationProfileBindingFromLogs(receipt.logs, deployment.factory);
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
  if (profileId === undefined) {
    return 0n;
  }
  if (!deployment.hookRegistry) {
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
