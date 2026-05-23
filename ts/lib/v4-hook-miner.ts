import { concatHex, getAddress, keccak256, padHex, toHex, type Hex } from "viem";

export const BEFORE_SWAP_FLAG = 1n << 7n;
export const BEFORE_SWAP_RETURNS_DELTA_FLAG = 1n << 3n;
export const SELL_TAX_HOOK_FLAGS = BEFORE_SWAP_FLAG | BEFORE_SWAP_RETURNS_DELTA_FLAG;
export const HOOK_PERMISSION_MASK = (1n << 14n) - 1n;

type MineArgs = {
  deployer: `0x${string}`;
  initCodeHash: Hex;
  requiredFlags?: bigint;
  permissionMask?: bigint;
  startSalt?: bigint;
  maxIterations?: bigint;
};

export type MinedHookAddress = {
  salt: Hex;
  address: `0x${string}`;
  iterations: bigint;
};

export function mineCreate2HookAddress({
  deployer,
  initCodeHash,
  requiredFlags = SELL_TAX_HOOK_FLAGS,
  permissionMask = HOOK_PERMISSION_MASK,
  startSalt = 0n,
  maxIterations = 1_000_000n,
}: MineArgs): MinedHookAddress {
  const checksummedDeployer = getAddress(deployer);

  for (let i = 0n; i < maxIterations; i++) {
    const saltValue = startSalt + i;
    const salt = padHex(toHex(saltValue), { size: 32 });
    const address = create2Address(checksummedDeployer, salt, initCodeHash);
    if ((BigInt(address) & permissionMask) === requiredFlags) {
      return { salt, address, iterations: i + 1n };
    }
  }

  throw new Error(`Unable to mine CREATE2 hook address within ${maxIterations} iterations`);
}

export function create2Address(deployer: `0x${string}`, salt: Hex, initCodeHash: Hex): `0x${string}` {
  const digest = keccak256(concatHex(["0xff", getAddress(deployer), salt, initCodeHash]));
  return getAddress(`0x${digest.slice(-40)}`);
}
