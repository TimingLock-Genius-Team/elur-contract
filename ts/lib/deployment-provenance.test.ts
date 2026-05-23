import { strict as assert } from "node:assert";
import test from "node:test";
import { resolveDeploymentTimestamp } from "./deployment-provenance.js";

test("resolveDeploymentTimestamp falls back when DEPLOYED_AT is empty", () => {
  assert.equal(
    resolveDeploymentTimestamp({ DEPLOYED_AT: "" }, () => "2026-05-23T00:00:00.000Z"),
    "2026-05-23T00:00:00.000Z",
  );
});

test("resolveDeploymentTimestamp preserves explicit deployment provenance", () => {
  assert.equal(
    resolveDeploymentTimestamp({ DEPLOYED_AT: "2026-05-22T00:00:00.000Z" }, () => "2026-05-23T00:00:00.000Z"),
    "2026-05-22T00:00:00.000Z",
  );
});
