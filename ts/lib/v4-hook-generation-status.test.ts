import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildV4HookFrontendStatus,
  v4HookGenerationStates,
} from "./v4-hook-generation-status.js";

test("v4 hook generation states expose the frontend workflow order", () => {
  assert.deepEqual(v4HookGenerationStates, [
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
  ]);
});

test("frontend status payload carries disclosures and launch readiness", () => {
  const status = buildV4HookFrontendStatus({
    generationId: "gen_01HZY9X7K8N2V4HOOK",
    hookId: "ai-launch-tax",
    state: "approved",
    chainId: 31337,
    poolManager: "0x1111111111111111111111111111111111111111",
    hookAddress: "0x22222222222222222222222222222222222222c8",
    permissionMask: 0x00c8,
    registryEntryId: 7n,
    reportURI: "ipfs://report",
    riskLabels: ["CUSTOM_HOOK", "SELL_TAX"],
    worstCaseFeeOrTax: "Worst case is maxSellTaxBps.",
    exactOutputWarning: "Exact-output sells are unsupported.",
    hookDataRequirements: "No hookData required.",
    routerIdentityWarning:
      "The hook observes the swap sender, which can be a router rather than the end-user wallet.",
    directV4Ready: true,
    curveFirstReady: true,
  });

  assert.equal(status.launchReadiness.directV4, true);
  assert.equal(status.launchReadiness.curveFirst, true);
  assert.equal(status.disclosures.riskLabels[0], "CUSTOM_HOOK");
  assert.equal(status.registryEntryId, "7");
});
