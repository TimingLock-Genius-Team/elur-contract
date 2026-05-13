function valueForFlag(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

export function getArg(name: string, fallback?: string): string {
  const value = valueForFlag(name);
  if (value !== undefined) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required argument --${name}`);
}

export function optionalArg(name: string): string | undefined {
  return valueForFlag(name);
}

export function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function getRequiredMinOutArg(): bigint {
  const minOut = BigInt(getArg("min-out"));
  if (minOut === 0n && !hasArg("allow-zero-min-out")) {
    throw new Error("Refusing --min-out 0 without --allow-zero-min-out");
  }
  return minOut;
}
