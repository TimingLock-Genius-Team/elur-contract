// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract GraduationMigrationTest is SatpadTestBase {
    function test_RevertWhen_MigrateBeforeGraduation() public {
        (, SatpadHook hook,) = createDemoToken();

        vm.expectRevert(SatpadHook.NotSelfDeprecated.selector);
        hook.migrateLiquidity("");
    }

    function test_MigrationMovesAllReserveAndMintsLiquidityTokensToTarget() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();
        for (uint256 i = 0; i < 47; i++) {
            vm.roll(i + 2);
            buy(router, token, trader, 10e18);
        }

        uint256 reserve = address(hook).balance;
        uint256 supplyBefore = token.totalSupply();
        (address pool, uint256 liquidity) = hook.migrateLiquidity("migration-data");

        assertEq(pool, migrationTarget.pool());
        assertEq(liquidity, migrationTarget.liquidity());
        assertEq(address(hook).balance, 0);
        assertEq(migrationTarget.lastOkbAmount(), reserve);
        assertEq(migrationTarget.lastTokenAmount(), 21_000_000e18 - supplyBefore);
        assertEq(token.balanceOf(address(migrationTarget)), 21_000_000e18 - supplyBefore);
        assertTrue(hook.liquidityMigrated());
    }

    function test_RevertWhen_MigrationRunsTwice() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();
        for (uint256 i = 0; i < 47; i++) {
            vm.roll(i + 2);
            buy(router, token, trader, 10e18);
        }

        hook.migrateLiquidity("");

        vm.expectRevert(SatpadHook.LiquidityAlreadyMigrated.selector);
        hook.migrateLiquidity("");
    }
}
