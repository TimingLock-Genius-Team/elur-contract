import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Abi } from "viem";

type Artifact = {
  abi: Abi;
  bytecode?: { object: `0x${string}` };
};

export function readArtifact(relativePath: string): Artifact {
  const artifactPath = join(process.cwd(), "out", relativePath);
  return JSON.parse(readFileSync(artifactPath, "utf8")) as Artifact;
}

export function abiOf(relativePath: string): Abi {
  return readArtifact(relativePath).abi;
}

export function bytecodeOf(relativePath: string): `0x${string}` {
  const bytecode = readArtifact(relativePath).bytecode?.object;
  if (!bytecode || bytecode === "0x") {
    throw new Error(`Artifact ${relativePath} has no deployable bytecode`);
  }
  return bytecode;
}
