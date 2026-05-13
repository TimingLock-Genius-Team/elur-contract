import type { DeploymentDoctorResult } from "./deployment-doctor.js";
import type { Deployment } from "../config/deployments.js";
import type { MigrationTargetDeploymentRecord } from "../config/migration-target-deployments.js";

function envEquals(env: NodeJS.ProcessEnv, name: string, expected: string): boolean {
  return env[name]?.toLowerCase() === expected.toLowerCase();
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function doctorXLayerReadinessConsistency(
  deployment: Deployment,
  migrationTargetDeployment: MigrationTargetDeploymentRecord,
  env: NodeJS.ProcessEnv = process.env,
): DeploymentDoctorResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (deployment.chainId !== migrationTargetDeployment.chainId) {
    errors.push(
      `deployment chainId ${deployment.chainId} does not match migration target deployment chainId ${migrationTargetDeployment.chainId}`,
    );
  }
  if (!sameAddress(deployment.migrationTarget, migrationTargetDeployment.migrationTarget)) {
    errors.push(
      `deployment migrationTarget ${deployment.migrationTarget} does not match migration target deployment migrationTarget ${migrationTargetDeployment.migrationTarget}`,
    );
  }
  if (!sameAddress(deployment.uniswapV4PoolManager, migrationTargetDeployment.uniswapV4PoolManager)) {
    errors.push(
      `deployment uniswapV4PoolManager ${deployment.uniswapV4PoolManager} does not match migration target deployment uniswapV4PoolManager ${migrationTargetDeployment.uniswapV4PoolManager}`,
    );
  }
  if (!sameAddress(deployment.uniswapV4PositionManager, migrationTargetDeployment.uniswapV4PositionManager)) {
    errors.push(
      `deployment uniswapV4PositionManager ${deployment.uniswapV4PositionManager} does not match migration target deployment uniswapV4PositionManager ${migrationTargetDeployment.uniswapV4PositionManager}`,
    );
  }

  if (!envEquals(env, "TEAM_MULTISIG", deployment.feeRecipient)) {
    errors.push("TEAM_MULTISIG does not match deployment feeRecipient");
  }
  if (!envEquals(env, "MIGRATION_TARGET", deployment.migrationTarget)) {
    errors.push("MIGRATION_TARGET does not match deployment migrationTarget");
  }
  if (!envEquals(env, "UNISWAP_V4_POOL_MANAGER", migrationTargetDeployment.uniswapV4PoolManager)) {
    errors.push("UNISWAP_V4_POOL_MANAGER does not match migration target deployment uniswapV4PoolManager");
  }
  if (!envEquals(env, "UNISWAP_V4_POSITION_MANAGER", migrationTargetDeployment.uniswapV4PositionManager)) {
    errors.push("UNISWAP_V4_POSITION_MANAGER does not match migration target deployment uniswapV4PositionManager");
  }
  if (!envEquals(env, "LP_RECIPIENT", migrationTargetDeployment.lpRecipient)) {
    errors.push("LP_RECIPIENT does not match migration target deployment lpRecipient");
  }
  if (sameAddress(migrationTargetDeployment.lpRecipient, deployment.deployer)) {
    errors.push("LP_RECIPIENT must not equal deployment deployer");
  }

  return { ok: errors.length === 0, errors, warnings };
}
