import { hasArg, getArg } from "../lib/args.js";
import {
  getV4HookPluginTemplate,
  type V4HookPluginManifest,
} from "../config/v4-hook-plugin-manifest.js";
import {
  type HookRiskLabel,
  type HookTemplateId,
} from "../config/v4-hook-templates.js";

export const simulationMatrixFields = [
  "permissionMask",
  "poolInitialization",
  "initialLiquidity",
  "buySimulation",
  "sellSimulation",
  "exactOutputBuy",
  "exactOutputSell",
  "largeTrade",
  "unsupportedPool",
  "unauthorizedCaller",
  "emptyHookData",
  "malformedHookData",
  "eventAssertions",
  "metadataSerialization",
  "worstCaseDisclosure",
] as const;

export type SimulationMatrixField = (typeof simulationMatrixFields)[number];

export type SimulationCheck = {
  status: "pass" | "fail" | "pending";
  summary: string;
};

export type V4HookTemplateSimulationResult = {
  templateId: HookTemplateId;
  network: "anvil";
  hookAddress: `0x${string}` | null;
  checks: Record<SimulationMatrixField, SimulationCheck>;
  expectedEvents: readonly string[];
  riskLabels: readonly HookRiskLabel[];
  worstCaseFeeOrTax: string;
  status: "pass" | "fail" | "pending";
};

export type V4HookVerificationReport = V4HookTemplateSimulationResult & {
  policyProfile: "EULR_GENERATED_HOOK_V1";
  hashes: {
    sourceMetadataHash: `0x${string}`;
    artifactMetadataHash: `0x${string}`;
    bytecodeHash: `0x${string}`;
    constructorArgsHash: `0x${string}`;
  };
  toolVersions: {
    forge: string;
    solc: string;
    node: string;
  };
  generatedAt: string;
};

export function buildV4HookTemplateSimulation(input: {
  template: HookTemplateId;
  network: "anvil";
  plugins?: readonly V4HookPluginManifest[];
}): V4HookTemplateSimulationResult {
  const pluginTemplate = getV4HookPluginTemplate(input.template, input.plugins);
  const template = pluginTemplate.template;
  const checks = Object.fromEntries(
    simulationMatrixFields.map((field) => [
      field,
      { status: "pending", summary: summaryFor(field, template.id) },
    ]),
  ) as Record<SimulationMatrixField, SimulationCheck>;

  return {
    templateId: template.id,
    network: input.network,
    hookAddress: null,
    checks,
    expectedEvents: pluginTemplate.simulation.expectedEvents,
    riskLabels: [...template.riskLabels],
    worstCaseFeeOrTax: template.worstCaseFeeOrTax,
    status: "pending",
  };
}

export function buildV4HookVerificationReport(input: {
  template: HookTemplateId;
  network: "anvil";
  hookAddress: `0x${string}`;
  sourceMetadataHash: `0x${string}`;
  artifactMetadataHash: `0x${string}`;
  bytecodeHash: `0x${string}`;
  constructorArgsHash: `0x${string}`;
  toolVersions: {
    forge: string;
    solc: string;
    node: string;
  };
  checks: Record<SimulationMatrixField, SimulationCheck>;
  plugins?: readonly V4HookPluginManifest[];
}): V4HookVerificationReport {
  const base = buildV4HookTemplateSimulation(input);
  const statuses = Object.values(input.checks).map((check) => check.status);
  const status = statuses.includes("fail")
    ? "fail"
    : statuses.includes("pending")
      ? "pending"
      : "pass";

  return {
    ...base,
    hookAddress: input.hookAddress,
    checks: input.checks,
    status,
    policyProfile: "EULR_GENERATED_HOOK_V1",
    hashes: {
      sourceMetadataHash: input.sourceMetadataHash,
      artifactMetadataHash: input.artifactMetadataHash,
      bytecodeHash: input.bytecodeHash,
      constructorArgsHash: input.constructorArgsHash,
    },
    toolVersions: input.toolVersions,
    generatedAt: new Date().toISOString(),
  };
}

function main() {
  const template = getArg("template") as HookTemplateId;
  const network = getArg("network", "anvil");
  if (network !== "anvil") {
    throw new Error(
      "simulate-v4-hook-template currently supports --network anvil only",
    );
  }

  const result = buildV4HookTemplateSimulation({ template, network });
  if (hasArg("json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`${result.templateId}: ${result.status}`);
}

function summaryFor(
  field: SimulationMatrixField,
  templateId: HookTemplateId,
): string {
  return `${templateId} ${field} is metadata-only; no on-chain simulation has run yet`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
