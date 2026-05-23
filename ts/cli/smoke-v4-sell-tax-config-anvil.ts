import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ANVIL_CHAIN_ID } from "../config/chains.js";
import { deploymentNetwork } from "../config/deployments.js";
import { readMigrationTargetDeployment } from "../config/migration-target-deployments.js";
import { publicClient } from "../lib/clients.js";
import { printJson } from "../lib/json.js";

type HookDeployOutput = {
  hook: `0x${string}`;
  env?: {
    XLAYER_V4_HOOKS?: `0x${string}`;
  };
};

function runNpmScript(script: string, env: NodeJS.ProcessEnv): string {
  return execFileSync("npm", ["run", "--silent", script], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

const client = publicClient();
const chainId = await client.getChainId();
assert.equal(deploymentNetwork(), "anvil", "v4 sell tax config smoke only runs against anvil deployments");
assert.equal(chainId, ANVIL_CHAIN_ID, "v4 sell tax config smoke requires an anvil chain");

const hookDeploy = JSON.parse(runNpmScript("deploy:v4-sell-tax-hook", process.env)) as HookDeployOutput;
const hooks = hookDeploy.env?.XLAYER_V4_HOOKS ?? hookDeploy.hook;
const migrationTargetEnv = { ...process.env, DEPLOYMENT_NETWORK: "anvil", XLAYER_V4_HOOKS: hooks };

runNpmScript("deploy:migration-target", migrationTargetEnv);
runNpmScript("doctor:migration-target", migrationTargetEnv);

const deployment = readMigrationTargetDeployment("anvil");
assert.equal(deployment.migrationPool.hooks.toLowerCase(), hooks.toLowerCase(), "migration target must record mined hook");

printJson({
  ok: true,
  chainId,
  hook: hooks,
  migrationTarget: deployment.migrationTarget,
  migrationPool: deployment.migrationPool,
});
