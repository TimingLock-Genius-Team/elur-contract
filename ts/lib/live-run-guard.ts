import { ANVIL_CHAIN_ID } from "../config/chains.js";

export function assertLocalSimulationOrAllowed(options: {
  allowLive: boolean;
  chainId: number;
  maxIterations?: number;
  network: string;
  scriptName: string;
}): void {
  if (options.network === "anvil" && options.chainId === ANVIL_CHAIN_ID) {
    return;
  }

  if (!options.allowLive) {
    throw new Error(`${options.scriptName} refuses to run outside Anvil without --allow-live`);
  }

  if (options.maxIterations === undefined) {
    throw new Error(`${options.scriptName} requires --max-buys when --allow-live is set`);
  }
}

export function maxIterationsFromArg(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(parsed)) {
    throw new Error("--max-buys must be a positive integer");
  }

  return parsed;
}
