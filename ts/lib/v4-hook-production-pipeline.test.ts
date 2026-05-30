import { strict as assert } from "node:assert";
import test from "node:test";
import {
  nextV4HookProductionStep,
  requireV4HookProductionStep,
  type V4HookProductionPipelineState,
} from "./v4-hook-production-pipeline.js";

const emptyState: V4HookProductionPipelineState = {
  generationId: "gen_01HZY9X7K8N2V4HOOK",
  hookId: "ai-launch-tax",
  chainId: 31337,
  steps: {
    generated: "pending",
    verified: "pending",
    deployed: "pending",
    submitted: "pending",
    verificationPublished: "pending",
    registryAdvanced: "pending",
    approved: "pending",
  },
};

test("v4 hook production pipeline resumes at the first incomplete step", () => {
  assert.equal(nextV4HookProductionStep(emptyState), "generated");
  assert.equal(
    nextV4HookProductionStep({
      ...emptyState,
      steps: { ...emptyState.steps, generated: "pass", verified: "pass" },
    }),
    "deployed",
  );
  assert.equal(
    nextV4HookProductionStep({
      ...emptyState,
      steps: {
        generated: "pass",
        verified: "pass",
        deployed: "pass",
        submitted: "pass",
        verificationPublished: "pass",
        registryAdvanced: "pass",
        approved: "pass",
      },
    }),
    null,
  );
});

test("v4 hook production pipeline blocks out-of-order execution", () => {
  assert.throws(
    () => requireV4HookProductionStep(emptyState, "deployed"),
    /Cannot execute deployed before generated/,
  );

  assert.doesNotThrow(() =>
    requireV4HookProductionStep(
      {
        ...emptyState,
        steps: { ...emptyState.steps, generated: "pass", verified: "pass" },
      },
      "deployed",
    ),
  );
});

test("v4 hook production pipeline stops on failed prerequisites", () => {
  assert.equal(
    nextV4HookProductionStep({
      ...emptyState,
      steps: { ...emptyState.steps, generated: "pass", verified: "fail" },
    }),
    "verified",
  );

  assert.throws(
    () =>
      requireV4HookProductionStep(
        {
          ...emptyState,
          steps: { ...emptyState.steps, generated: "pass", verified: "fail" },
        },
        "deployed",
      ),
    /Cannot execute deployed because verified failed/,
  );
});
