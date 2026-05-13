import "dotenv/config";
import { readDeployment } from "../config/deployments.js";
import { readMigrationTargetDeployment } from "../config/migration-target-deployments.js";
import { printJson } from "../lib/json.js";
import { doctorXLayerReadinessConsistency } from "../lib/xlayer-readiness-consistency.js";

const network = "xlayer";

try {
  const result = doctorXLayerReadinessConsistency(
    readDeployment(network),
    readMigrationTargetDeployment(network),
  );

  printJson({ network, ...result });

  if (!result.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  printJson({ network, ok: false, errors: [message], warnings: [] });
  process.exitCode = 1;
}
