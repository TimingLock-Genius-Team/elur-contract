// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract SelfDeprecationAndMigrationTest is SatpadTestBase {
    function test_BuyClosesPermanentlyAfterSelfDeprecationButSellStaysOpen() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();

        uint256 totalBought;
        for (uint256 i = 0; i < 47; i++) {
            vm.roll(i + 2);
            totalBought += buy(router, token, trader, 10e18);
        }

        assertTrue(hook.selfDeprecated());

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(SatpadHook.SelfDeprecatedBuyClosed.selector);
        router.buy{value: 1e18}(address(token), 0, trader);

        vm.roll(100);
        vm.startPrank(trader);
        token.approve(address(router), totalBought / 100);
        router.sell(address(token), totalBought / 100, 0, trader);
        vm.stopPrank();
    }

    function test_MigrationRequiresGraduationAndCanOnlyRunOnce() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();

        vm.expectRevert(SatpadHook.NotSelfDeprecated.selector);
        hook.migrateLiquidity("");

        for (uint256 i = 0; i < 47; i++) {
            vm.roll(i + 2);
            buy(router, token, trader, 10e18);
        }

        uint256 hookBalance = address(hook).balance;
        (address pool, uint256 liquidity) = hook.migrateLiquidity("satpad-local-migration");

        assertEq(pool, migrationTarget.pool());
        assertEq(liquidity, migrationTarget.liquidity());
        assertEq(migrationTarget.lastToken(), address(token));
        assertEq(migrationTarget.lastOkbAmount(), hookBalance);
        assertTrue(hook.liquidityMigrated());
        assertEq(address(hook).balance, 0);

        vm.expectRevert(SatpadHook.LiquidityAlreadyMigrated.selector);
        hook.migrateLiquidity("");
    }
}
