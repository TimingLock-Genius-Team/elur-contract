import { strict as assert } from "node:assert";
import test from "node:test";
import { ANVIL_CHAIN_ID, XLAYER_CHAIN_ID } from "../config/chains.js";
import { assertLocalSimulationOrAllowed, maxIterationsFromArg } from "./live-run-guard.js";

test("assertLocalSimulationOrAllowed accepts Anvil without an override", () => {
  assert.doesNotThrow(() => assertLocalSimulationOrAllowed({
    allowLive: false,
    chainId: ANVIL_CHAIN_ID,
    network: "anvil",
    scriptName: "simulate-graduation",
  }));
});

test("assertLocalSimulationOrAllowed rejects live networks unless explicitly allowed", () => {
  assert.throws(
    () => assertLocalSimulationOrAllowed({
      allowLive: false,
      chainId: XLAYER_CHAIN_ID,
      network: "xlayer",
      scriptName: "simulate-graduation",
    }),
    /simulate-graduation refuses to run outside Anvil without --allow-live/,
  );
});

test("assertLocalSimulationOrAllowed rejects live networks even with an override", () => {
  assert.throws(
    () => assertLocalSimulationOrAllowed({
      allowLive: true,
      chainId: XLAYER_CHAIN_ID,
      maxIterations: 3,
      network: "xlayer",
      scriptName: "simulate-graduation",
    }),
    /simulate-graduation does not support live network execution/,
  );
});

test("maxIterationsFromArg parses positive iteration caps", () => {
  assert.equal(maxIterationsFromArg("5"), 5);
  assert.equal(maxIterationsFromArg(undefined), undefined);
});

test("maxIterationsFromArg rejects invalid iteration caps", () => {
  assert.throws(() => maxIterationsFromArg("0"), /--max-buys must be a positive integer/);
  assert.throws(() => maxIterationsFromArg("1.5"), /--max-buys must be a positive integer/);
});
