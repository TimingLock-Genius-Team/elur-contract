import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { allV4HookTemplates } from "../config/v4-hook-templates.js";
import { eulrOfficialV4HookPlugin } from "../config/v4-hook-plugin-manifest.js";
import {
  buildV4HookTemplateSimulation,
  buildV4HookVerificationReport,
  type SimulationCheck,
  type SimulationMatrixField,
  simulationMatrixFields,
} from "./simulate-v4-hook-template.js";

test("v4 hook template simulation emits complete deterministic matrix for every template", () => {
  for (const template of allV4HookTemplates) {
    const result = buildV4HookTemplateSimulation({ template: template.id, network: "anvil" });

    assert.equal(result.templateId, template.id);
    assert.equal(result.network, "anvil");
    assert.equal(result.status, "pending");
    for (const field of simulationMatrixFields) {
      assert.equal(result.checks[field].status, "pending", `${template.id}.${field} must be explicit placeholder`);
    }
    assert.deepEqual(result.riskLabels, [...template.riskLabels]);
    assert.equal(result.worstCaseFeeOrTax, template.worstCaseFeeOrTax);
  }
});

test("simulate-v4-hook-template CLI emits JSON for selected template", () => {
  const result = spawnSync(process.execPath, [
    "--import",
    "tsx",
    "ts/cli/simulate-v4-hook-template.ts",
    "--template",
    "diamond-hands-decay-tax",
    "--network",
    "anvil",
    "--json",
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.templateId, "diamond-hands-decay-tax");
  assert.equal(parsed.status, "pending");
  assert.ok(parsed.checks.exactOutputSell);
});

test("simulation can resolve templates from an injected plugin manifest", () => {
  const diamond = eulrOfficialV4HookPlugin.templates[0];
  const plugin = {
    id: "@example/v4-hooks",
    name: "Example V4 Hooks",
    version: "0.0.1",
    registryInterface: "IEulrHookRegistry",
    templates: [
      {
        ...diamond,
        template: {
          ...diamond.template,
          id: "example-dynamic-hook",
          name: "Example Dynamic Hook",
          simulationPackageId: "example/dynamic-hook",
          simulationStatus: {
            status: "PENDING_LOCAL_SIMULATION",
            packageId: "example/dynamic-hook",
          },
        },
        simulation: {
          packageId: "example/dynamic-hook",
          expectedEvents: ["ExampleEvent"],
        },
      },
    ],
  } as const;

  const result = buildV4HookTemplateSimulation({
    template: "example-dynamic-hook",
    network: "anvil",
    plugins: [plugin],
  });

  assert.equal(result.templateId, "example-dynamic-hook");
  assert.deepEqual(result.expectedEvents, ["ExampleEvent"]);
});

test("verification report binds simulation results to reproducible hook artifacts", () => {
  const checks = Object.fromEntries(
    simulationMatrixFields.map((field) => [
      field,
      { status: "pass" as const, summary: `${field} passed` },
    ]),
  ) as Record<SimulationMatrixField, SimulationCheck>;

  const report = buildV4HookVerificationReport({
    template: "diamond-hands-decay-tax",
    network: "anvil",
    hookAddress: "0x00000000000000000000000000000000000000c8",
    sourceMetadataHash: `0x${"11".repeat(32)}`,
    artifactMetadataHash: `0x${"22".repeat(32)}`,
    bytecodeHash: `0x${"33".repeat(32)}`,
    constructorArgsHash: `0x${"44".repeat(32)}`,
    toolVersions: {
      forge: "1.0.0",
      solc: "0.8.26",
      node: process.version,
    },
    checks,
  });

  assert.equal(report.status, "pass");
  assert.equal(report.hookAddress, "0x00000000000000000000000000000000000000c8");
  assert.equal(report.hashes.sourceMetadataHash, `0x${"11".repeat(32)}`);
  assert.equal(report.hashes.artifactMetadataHash, `0x${"22".repeat(32)}`);
  assert.equal(report.hashes.bytecodeHash, `0x${"33".repeat(32)}`);
  assert.equal(report.hashes.constructorArgsHash, `0x${"44".repeat(32)}`);
  assert.equal(report.policyProfile, "EULR_GENERATED_HOOK_V1");
  assert.ok(report.generatedAt.endsWith("Z"));
});
