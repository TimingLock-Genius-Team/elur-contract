export function getArg(name: string, fallback?: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required argument ${flag}`);
}

export function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
