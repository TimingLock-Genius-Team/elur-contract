import "dotenv/config";
import { printJson } from "../lib/json.js";
import { validateXLayerReadinessPreflight } from "../lib/preflight.js";

const result = validateXLayerReadinessPreflight();
printJson(result);

if (!result.ok) {
  process.exitCode = 1;
}
