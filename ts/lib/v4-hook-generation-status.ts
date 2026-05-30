export const v4HookGenerationStates = [
  "draft",
  "generated",
  "buildRunning",
  "verificationRunning",
  "simulationPassed",
  "deployed",
  "submitted",
  "verifiedOnchain",
  "approved",
  "readyForDirectV4Launch",
  "readyForCurveFirstMigrationProfile",
] as const;

export type V4HookGenerationState = (typeof v4HookGenerationStates)[number];

export type V4HookFrontendStatusInput = {
  generationId: string;
  hookId: string;
  state: V4HookGenerationState;
  chainId: number;
  poolManager: `0x${string}`;
  hookAddress?: `0x${string}`;
  permissionMask: number;
  registryEntryId?: bigint;
  reportURI?: string;
  riskLabels: readonly string[];
  worstCaseFeeOrTax: string;
  exactOutputWarning: string;
  hookDataRequirements: string;
  routerIdentityWarning: string;
  directV4Ready: boolean;
  curveFirstReady: boolean;
};

export type V4HookFrontendStatus = {
  generationId: string;
  hookId: string;
  state: V4HookGenerationState;
  chainId: number;
  poolManager: `0x${string}`;
  hookAddress: `0x${string}` | null;
  permissionMask: number;
  registryEntryId: string | null;
  reportURI: string | null;
  launchReadiness: {
    directV4: boolean;
    curveFirst: boolean;
  };
  disclosures: {
    riskLabels: readonly string[];
    worstCaseFeeOrTax: string;
    exactOutputWarning: string;
    hookDataRequirements: string;
    routerIdentityWarning: string;
  };
};

export function buildV4HookFrontendStatus(
  input: V4HookFrontendStatusInput,
): V4HookFrontendStatus {
  return {
    generationId: input.generationId,
    hookId: input.hookId,
    state: input.state,
    chainId: input.chainId,
    poolManager: input.poolManager,
    hookAddress: input.hookAddress ?? null,
    permissionMask: input.permissionMask,
    registryEntryId: input.registryEntryId?.toString() ?? null,
    reportURI: input.reportURI ?? null,
    launchReadiness: {
      directV4: input.directV4Ready,
      curveFirst: input.curveFirstReady,
    },
    disclosures: {
      riskLabels: [...input.riskLabels],
      worstCaseFeeOrTax: input.worstCaseFeeOrTax,
      exactOutputWarning: input.exactOutputWarning,
      hookDataRequirements: input.hookDataRequirements,
      routerIdentityWarning: input.routerIdentityWarning,
    },
  };
}
