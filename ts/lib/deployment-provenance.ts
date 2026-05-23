export function resolveDeploymentTimestamp(
  env: Partial<Pick<NodeJS.ProcessEnv, "DEPLOYED_AT">> = process.env,
  now: () => string = () => new Date().toISOString(),
): string {
  return env.DEPLOYED_AT && env.DEPLOYED_AT.length > 0 ? env.DEPLOYED_AT : now();
}
