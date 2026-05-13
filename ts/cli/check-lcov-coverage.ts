import { readFileSync } from "node:fs";
import { printJson } from "../lib/json.js";
import { meetsLineCoverageThreshold, parseLcovLineCoverage } from "../lib/lcov-coverage.js";

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

const reportPath = optionValue("--lcov") ?? "lcov.info";
const minLines = Number(optionValue("--min-lines") ?? process.env.COVERAGE_MIN_LINES ?? "95");

try {
  const coverage = parseLcovLineCoverage(readFileSync(reportPath, "utf8"));
  const ok = meetsLineCoverageThreshold(coverage, minLines);

  printJson({
    ok,
    reportPath,
    minLines,
    lines: {
      hit: coverage.linesHit,
      found: coverage.linesFound,
      percent: Number(coverage.percent.toFixed(2)),
    },
  });

  if (!ok) {
    process.exitCode = 1;
  }
} catch (error) {
  printJson({
    ok: false,
    reportPath,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
