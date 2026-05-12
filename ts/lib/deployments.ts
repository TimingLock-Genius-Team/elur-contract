import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Deployment = {
  chainId: number;
  commit: string;
  deployedAt: string;
  deployer: `0x${string}`;
  factory: `0x${string}`;
  feeRecipient: `0x${string}`;
  sat1HookDeployer: `0x${string}`;
  uniswapV4PoolManager: `0x${string}`;
  uniswapV4PositionManager: `0x${string}`;
  migrationTarget: `0x${string}`;
  curve: {
    k: string;
    s: string;
    feeBps: number;
    selfDeprecationBps: number;
    maxBuyOkb: string;
  };
  createdTokens: Array<{ token: `0x${string}`; hook: `0x${string}`; router: `0x${string}` }>;
};

export function deploymentPath(network = "anvil"): string {
  return join(process.cwd(), "deployments", network, "latest.json");
}

export function readDeployment(network = "anvil"): Deployment {
  return JSON.parse(readFileSync(deploymentPath(network), "utf8")) as Deployment;
}

export function writeDeployment(deployment: Deployment, network = "anvil"): void {
  const path = deploymentPath(network);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(deployment, null, 2)}\n`);
}

export function latestToken(deployment: Deployment): `0x${string}` {
  const entry = deployment.createdTokens.at(-1);
  if (!entry) {
    throw new Error("No created token found in deployment JSON");
  }
  return entry.token;
}
