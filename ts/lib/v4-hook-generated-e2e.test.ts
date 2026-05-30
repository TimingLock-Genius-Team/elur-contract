import { strict as assert } from "node:assert";
import test from "node:test";
import { generatedHookE2ECommands } from "./v4-hook-generated-e2e.js";

test("generated hook E2E commands cover verifier, direct v4, and curve-first paths", () => {
  const commands = generatedHookE2ECommands({
    manifestPath: "custom-hook/hooks/ai-launch-tax/manifest.generated.json",
    registryEntryId: 7n,
    directLaunchArgs:
      "--name DirectAI --symbol DAI --metadata-uri ipfs://direct --registry-entry 7 --initial-okb 1",
    curveLaunchArgs:
      "--name CurveAI --symbol CAI --metadata-uri ipfs://curve --curve-s 25 --v4-migration-profile 3",
    migrationProfileArgs: "--registry-entry 7 --pool-fee 3000 --tick-spacing 60",
  });

  assert.deepEqual(commands.map((entry) => entry.id), [
    "verify-generated-hook",
    "publish-generated-hook",
    "register-curve-first-profile",
    "direct-v4-launch",
    "curve-first-launch",
  ]);
  assert.match(commands[0].command, /simulate:v4-hook-template/);
  assert.match(commands[1].command, /--generated-v4-hook-manifest/);
  assert.match(commands[2].command, /register:v4-migration-profile/);
  assert.match(commands[3].command, /create:direct-v4-launch/);
  assert.match(commands[4].command, /create-token/);
});

test("generated hook E2E commands reject missing verifier-backed registry entry id", () => {
  assert.throws(
    () =>
      generatedHookE2ECommands({
        manifestPath: "custom-hook/hooks/ai-launch-tax/manifest.generated.json",
        registryEntryId: 0n,
        directLaunchArgs: "--name DirectAI",
        curveLaunchArgs: "--name CurveAI",
        migrationProfileArgs: "--pool-fee 3000",
      }),
    /registryEntryId must be non-zero/,
  );
});
