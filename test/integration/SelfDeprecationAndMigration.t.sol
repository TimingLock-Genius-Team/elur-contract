// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";

contract SelfDeprecationAndMigrationTest is EulrTestBase {
    function test_BuyClosesPermanentlyAfterSelfDeprecationButSellStaysOpen() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();

        uint256 totalBought;
        for (uint256 i = 0; i < GRADUATION_10OKB_BUYS; i++) {
            vm.roll(i + 2);
            totalBought += buy(router, token, trader, 10e18);
        }

        assertTrue(hook.selfDeprecated());

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(EulrHook.SelfDeprecatedBuyClosed.selector);
        router.buy{value: 1e18}(address(token), 0, trader);

        vm.roll(100);
        vm.startPrank(trader);
        token.approve(address(router), totalBought / 100);
        router.sell(address(token), totalBought / 100, 0, trader);
        vm.stopPrank();

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(EulrHook.SelfDeprecatedBuyClosed.selector);
        router.buy{value: 1e18}(address(token), 0, trader);
    }

    function test_MigrationRequiresGraduationAndCanOnlyRunOnce() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();

        vm.expectRevert(EulrHook.NotSelfDeprecated.selector);
        hook.migrateLiquidity("");

        for (uint256 i = 0; i < GRADUATION_10OKB_BUYS; i++) {
            vm.roll(i + 2);
            buy(router, token, trader, 10e18);
        }

        uint256 claimableFees = hook.claimableFeeOkb();
        uint256 reserve = address(hook).balance - claimableFees;
        (address pool, uint256 liquidity) = hook.migrateLiquidity("eulr-local-migration");

        assertEq(pool, migrationTarget.pool());
        assertEq(liquidity, migrationTarget.liquidity());
        assertEq(migrationTarget.lastToken(), address(token));
        assertEq(migrationTarget.lastOkbAmount(), reserve);
        assertTrue(hook.liquidityMigrated());
        assertEq(address(hook).balance, claimableFees);

        vm.expectRevert(EulrHook.LiquidityAlreadyMigrated.selector);
        hook.migrateLiquidity("");
    }

    function test_MigrationAfterSellDropsBelowGraduationThresholdUsesStickySelfDeprecated() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();

        uint256 totalBought;
        for (uint256 i = 0; i < GRADUATION_10OKB_BUYS; i++) {
            vm.roll(i + 2);
            totalBought += buy(router, token, trader, 10e18);
        }
        assertTrue(hook.selfDeprecated());

        vm.roll(100);
        vm.startPrank(trader);
        token.approve(address(router), totalBought / 100);
        router.sell(address(token), totalBought / 100, 0, trader);
        vm.stopPrank();

        assertTrue(hook.selfDeprecated());

        uint256 claimableFees = hook.claimableFeeOkb();
        uint256 reserve = address(hook).balance - claimableFees;
        (address pool, uint256 liquidity) = hook.migrateLiquidity("eulr-local-migration");

        assertEq(pool, migrationTarget.pool());
        assertEq(liquidity, migrationTarget.liquidity());
        assertEq(migrationTarget.lastToken(), address(token));
        assertEq(migrationTarget.lastOkbAmount(), reserve);
        assertTrue(hook.liquidityMigrated());
        assertEq(address(hook).balance, claimableFees);
    }
}
