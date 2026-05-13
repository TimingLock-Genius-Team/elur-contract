import { strict as assert } from "node:assert";
import test from "node:test";
import { meetsLineCoverageThreshold, parseLcovLineCoverage } from "./lcov-coverage.js";

test("parseLcovLineCoverage aggregates line counters across records", () => {
  const coverage = parseLcovLineCoverage([
    "TN:",
    "SF:src/A.sol",
    "LF:10",
    "LH:9",
    "end_of_record",
    "TN:",
    "SF:src/B.sol",
    "LF:30",
    "LH:29",
    "end_of_record",
  ].join("\n"));

  assert.deepEqual(coverage, {
    linesFound: 40,
    linesHit: 38,
    percent: 95,
  });
});

test("parseLcovLineCoverage rejects reports without line counters", () => {
  assert.throws(
    () => parseLcovLineCoverage("TN:\nSF:src/A.sol\nend_of_record\n"),
    /line coverage counters/,
  );
});

test("parseLcovLineCoverage rejects malformed line counters", () => {
  assert.throws(() => parseLcovLineCoverage("LF:not-a-number\nLH:1\n"), /Invalid LF counter/);
  assert.throws(() => parseLcovLineCoverage("LF:1\nLH:-1\n"), /Invalid LH counter/);
  assert.throws(() => parseLcovLineCoverage("LF:1\nLH:2\n"), /line hits exceed lines found/);
});

test("meetsLineCoverageThreshold compares against the configured minimum", () => {
  assert.equal(meetsLineCoverageThreshold({ linesFound: 100, linesHit: 95, percent: 95 }, 95), true);
  assert.equal(meetsLineCoverageThreshold({ linesFound: 100, linesHit: 94, percent: 94 }, 95), false);
});
