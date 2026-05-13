import "dotenv/config";
import { spawnSync } from "node:child_process";
import { runXLayerDeploymentGate } from "../lib/xlayer-deployment-gate.js";

const result = runXLayerDeploymentGate({
  run: (command, args) => {
    const child = spawnSync(command, args, {
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    return child.status;
  },
});

if (!result.ok) {
  console.error(`XLayer deployment gate failed: ${result.failedCommand}`);
}

process.exitCode = result.exitCode;
