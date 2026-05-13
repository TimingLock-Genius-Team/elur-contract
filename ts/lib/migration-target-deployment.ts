import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deploymentNetwork } from "./deployments.js";

export type MigrationTargetDeploymentRecord = {
  chainId: number;
  commit: string;
  deployedAt: string;
  deployer: `0x${string}`;
  migrationTarget: `0x${string}`;
  transactionHash: `0x${string}`;
  uniswapV4PoolManager: `0x${string}`;
  uniswapV4PositionManager: `0x${string}`;
  lpRecipient: `0x${string}`;
};

export function migrationTargetDeploymentPath(network = deploymentNetwork()): string {
  return join(process.cwd(), "deployments", network, "uniswap-v4-mint-position-target.json");
}

export function writeMigrationTargetDeployment(
  deployment: MigrationTargetDeploymentRecord,
  network = deploymentNetwork(),
): void {
  const path = migrationTargetDeploymentPath(network);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(deployment, null, 2)}\n`);
}
