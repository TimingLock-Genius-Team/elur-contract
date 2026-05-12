// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MigrationData} from "./MigrationData.sol";

library UniswapV4PoolKey {
    struct Key {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    function fromMigrationData(MigrationData.Params memory params) internal pure returns (Key memory key) {
        key = Key({
            currency0: params.currency0,
            currency1: params.currency1,
            fee: params.poolFee,
            tickSpacing: params.tickSpacing,
            hooks: params.hooks
        });
    }

    function toId(Key memory key) internal pure returns (bytes32 poolId) {
        assembly ("memory-safe") {
            // Matches Uniswap v4 PoolIdLibrary.toId(PoolKey): keccak256 over 5 ABI slots.
            poolId := keccak256(key, 0xa0)
        }
    }
}
