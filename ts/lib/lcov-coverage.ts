export type LcovLineCoverage = {
  linesFound: number;
  linesHit: number;
  percent: number;
};

export function parseLcovLineCoverage(lcov: string): LcovLineCoverage {
  let linesFound = 0;
  let linesHit = 0;

  for (const line of lcov.split(/\r?\n/)) {
    if (line.startsWith("LF:")) {
      linesFound += parseLcovCounter(line, "LF");
    } else if (line.startsWith("LH:")) {
      linesHit += parseLcovCounter(line, "LH");
    }
  }

  if (linesFound === 0) {
    throw new Error("LCOV report does not contain line coverage counters");
  }
  if (linesHit > linesFound) {
    throw new Error("LCOV line hits exceed lines found");
  }

  return {
    linesFound,
    linesHit,
    percent: (linesHit * 100) / linesFound,
  };
}

export function meetsLineCoverageThreshold(coverage: LcovLineCoverage, minPercent: number): boolean {
  if (!Number.isFinite(minPercent) || minPercent < 0 || minPercent > 100) {
    throw new Error("Line coverage threshold must be a finite percentage between 0 and 100");
  }
  return coverage.percent >= minPercent;
}

function parseLcovCounter(line: string, label: "LF" | "LH"): number {
  const value = line.slice(`${label}:`.length);
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label} counter: ${value}`);
  }
  return Number(value);
}
