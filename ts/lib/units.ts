import { formatEther, parseEther } from "viem";

export function parseOkb(value: string): bigint {
  return parseEther(value);
}

export function parseToken(value: string): bigint {
  return parseEther(value);
}

export function formatOkb(value: bigint): string {
  return `${formatEther(value)} OKB`;
}

export function formatToken(value: bigint): string {
  return `${formatEther(value)} token`;
}
