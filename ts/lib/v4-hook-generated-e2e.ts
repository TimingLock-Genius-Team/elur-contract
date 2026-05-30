export type GeneratedHookE2ECommand = {
  id:
    | "verify-generated-hook"
    | "publish-generated-hook"
    | "register-curve-first-profile"
    | "direct-v4-launch"
    | "curve-first-launch";
  command: string;
};

export type GeneratedHookE2EInput = {
  manifestPath: string;
  registryEntryId: bigint;
  migrationProfileArgs: string;
  directLaunchArgs: string;
  curveLaunchArgs: string;
};

export function generatedHookE2ECommands(input: GeneratedHookE2EInput): GeneratedHookE2ECommand[] {
  if (input.registryEntryId === 0n) {
    throw new Error("registryEntryId must be non-zero for generated hook production E2E");
  }

  return [
    {
      id: "verify-generated-hook",
      command: `npm run simulate:v4-hook-template -- --network anvil --generated-v4-hook-manifest ${input.manifestPath} --json`,
    },
    {
      id: "publish-generated-hook",
      command:
        `npm run export:abis:core -- --generated-v4-hook-manifest ${input.manifestPath}`
        + ` && npm run validate:v4-hook -- --entry-id ${input.registryEntryId} --stage validated`
        + ` && npm run validate:v4-hook -- --entry-id ${input.registryEntryId} --stage simulated`
        + ` && npm run approve:v4-hook -- --entry-id ${input.registryEntryId} --launch-modes both`,
    },
    {
      id: "register-curve-first-profile",
      command: `npm run register:v4-migration-profile -- ${input.migrationProfileArgs}`,
    },
    {
      id: "direct-v4-launch",
      command: `npm run create:direct-v4-launch -- ${input.directLaunchArgs}`,
    },
    {
      id: "curve-first-launch",
      command: `npm run create-token -- ${input.curveLaunchArgs}`,
    },
  ];
}
