import { XLAYER_CHAIN_ID } from "../config/chains.js";

export type GateCommand = readonly [command: string, ...args: string[]];

export type GateRunOptions = {
  run: (command: string, args: string[]) => number | null;
};

export type GateRunResult =
  | { ok: true; exitCode: 0 }
  | { ok: false; exitCode: number; failedCommand: string };

export function xlayerDeploymentGateCommands(): GateCommand[] {
  const xlayerChainId = String(XLAYER_CHAIN_ID);
  return [
    ["npm", "run", "preflight:xlayer:readiness"],
    ["npm", "run", "doctor:migration-target", "--", "--network", "xlayer", "--chain-id", xlayerChainId],
    ["npm", "run", "doctor:deployment", "--", "--network", "xlayer", "--chain-id", xlayerChainId],
    ["npm", "run", "doctor:xlayer-readiness"],
    ["npm", "run", "test:fork:xlayer"],
  ];
}

function renderCommand(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}

export function runXLayerDeploymentGate(options: GateRunOptions): GateRunResult {
  for (const [command, ...rawArgs] of xlayerDeploymentGateCommands()) {
    const status = options.run(command, rawArgs);
    if (status !== 0) {
      return {
        ok: false,
        exitCode: status ?? 1,
        failedCommand: renderCommand(command, rawArgs),
      };
    }
  }

  return { ok: true, exitCode: 0 };
}
