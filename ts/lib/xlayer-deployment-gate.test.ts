import { strict as assert } from "node:assert";
import test from "node:test";
import { XLAYER_CHAIN_ID } from "../config/chains.js";
import { runXLayerDeploymentGate, xlayerDeploymentGateCommands } from "./xlayer-deployment-gate.js";

const xlayerChainId = String(XLAYER_CHAIN_ID);

test("xlayerDeploymentGateCommands returns the readiness checks in deployment order", () => {
  assert.deepEqual(xlayerDeploymentGateCommands(), [
    ["npm", "run", "preflight:xlayer:readiness"],
    ["npm", "run", "doctor:migration-target", "--", "--network", "xlayer", "--chain-id", xlayerChainId],
    ["npm", "run", "doctor:deployment", "--", "--network", "xlayer", "--chain-id", xlayerChainId],
    ["npm", "run", "doctor:xlayer-readiness"],
    ["npm", "run", "test:fork:xlayer"],
  ]);
});

test("runXLayerDeploymentGate stops at the first failed command", () => {
  const calls: string[][] = [];
  const result = runXLayerDeploymentGate({
    run: (command, args) => {
      calls.push([command, ...args]);
      return calls.length === 2 ? 1 : 0;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.failedCommand,
    `npm run doctor:migration-target -- --network xlayer --chain-id ${xlayerChainId}`,
  );
  assert.equal(result.exitCode, 1);
  assert.deepEqual(calls, [
    ["npm", "run", "preflight:xlayer:readiness"],
    ["npm", "run", "doctor:migration-target", "--", "--network", "xlayer", "--chain-id", xlayerChainId],
  ]);
});

test("runXLayerDeploymentGate reports success after all commands pass", () => {
  const calls: string[][] = [];
  const result = runXLayerDeploymentGate({
    run: (command, args) => {
      calls.push([command, ...args]);
      return 0;
    },
  });

  assert.deepEqual(result, { ok: true, exitCode: 0 });
  assert.equal(calls.length, 5);
});
