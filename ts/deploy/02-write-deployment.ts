import { readDeployment, writeDeployment } from "../config/deployments.js";
import { printJson } from "../lib/json.js";

const deployment = readDeployment();
writeDeployment(deployment);

printJson(deployment);
