/**
 * Spawns Foundry `forge script` for Anvil-local flows (same as npm `script:deploy-local` / `script:create-token-and-buy-local`).
 *
 * Requires env:
 * - `PRIVATE_KEY` — hex private key (same as `forge script`)
 * - Optional `ANVIL_RPC_URL` (default http://127.0.0.1:8545)
 * - Optional `TEAM_MULTISIG` for deploy-factory
 *
 * For `create-token-and-buy`: set `FACTORY` (proxy) after deploy; optional `BUY_WEI`, `CURVE_S`.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const rpc = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";

function runForgeScript(scriptPath: string, contractName: string) {
  if (!process.env.PRIVATE_KEY) {
    console.error("anvil-forge: set PRIVATE_KEY (hex) in the environment.");
    process.exit(1);
  }

  const res = spawnSync(
    "forge",
    ["script", `${scriptPath}:${contractName}`, "--rpc-url", rpc, "--broadcast"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    },
  );

  if (res.error) {
    throw res.error;
  }
  process.exit(res.status ?? 1);
}

const [, , cmd] = process.argv;

if (cmd === "deploy-factory" || cmd === "local-deploy-factory") {
  runForgeScript("script/LocalDeployFactory.s.sol", "LocalDeployFactory");
} else if (
  cmd === "create-token-and-buy" ||
  cmd === "create-and-mint" ||
  cmd === "createandmint"
) {
  if (!process.env.FACTORY) {
    console.error("anvil-forge create-token-and-buy: set FACTORY (EulrFactory proxy address).");
    process.exit(1);
  }
  runForgeScript("script/CreateTokenAndBuyLocal.s.sol", "CreateTokenAndBuyLocal");
} else {
  console.error(`Usage:
  tsx ts/cli/anvil-forge.ts deploy-factory
  tsx ts/cli/anvil-forge.ts create-token-and-buy
  tsx ts/cli/anvil-forge.ts create-and-mint   (same forge script as create-token-and-buy)

Environment: PRIVATE_KEY, ANVIL_RPC_URL (optional), FACTORY (for create-token-and-buy / create-and-mint), BUY_WEI, CURVE_S (optional).`);
  process.exit(1);
}
