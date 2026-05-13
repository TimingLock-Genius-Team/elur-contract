import "dotenv/config";
import { printJson } from "../lib/json.js";
import { validateXLayerPreflight } from "../lib/preflight.js";

const result = validateXLayerPreflight();
printJson(result);

if (!result.ok) {
  process.exitCode = 1;
}
