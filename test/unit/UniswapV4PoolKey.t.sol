// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MigrationData} from "../../src/migration/MigrationData.sol";
import {UniswapV4PoolKey} from "../../src/migration/UniswapV4PoolKey.sol";

contract UniswapV4PoolKeyTest is Test {
    function test_FromMigrationDataBuildsCanonicalPoolKey() public pure {
        MigrationData.Params memory params = _params();

        UniswapV4PoolKey.Key memory key = UniswapV4PoolKey.fromMigrationData(params);

        assertEq(key.currency0, params.currency0);
        assertEq(key.currency1, params.currency1);
        assertEq(key.fee, params.poolFee);
        assertEq(key.tickSpacing, params.tickSpacing);
        assertEq(key.hooks, params.hooks);
    }

    function test_ToIdMatchesUniswapV4PoolIdEncoding() public pure {
        UniswapV4PoolKey.Key memory key = UniswapV4PoolKey.Key({
            currency0: address(0), currency1: address(0x1234), fee: 3000, tickSpacing: 60, hooks: address(0)
        });

        bytes32 poolId = UniswapV4PoolKey.toId(key);

        assertEq(poolId, keccak256(abi.encode(key)));
    }

    function _params() internal pure returns (MigrationData.Params memory params) {
        params = MigrationData.Params({
            currency0: address(0),
            currency1: address(0x1234),
            hooks: address(0),
            poolFee: 3000,
            tickSpacing: 60,
            tickLower: -887_220,
            tickUpper: 887_220,
            liquidity: 1e18,
            amount0Max: 10e18,
            amount1Max: 1_000e18,
            deadline: 1,
            lpRecipient: MigrationData.BURN_ADDRESS,
            hookData: ""
        });
    }
}
