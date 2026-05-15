// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";

contract GraduationMigrationTest is EulrTestBase {
    function test_RevertWhen_MigrateBeforeGraduation() public {
        (, EulrHook hook,) = createDemoToken();

        vm.expectRevert(EulrHook.NotSelfDeprecated.selector);
        hook.migrateLiquidity("");
    }

    function test_MigrationMovesAllReserveAndMintsLiquidityTokensToTarget() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        for (uint256 i = 0; i < 47; i++) {
            vm.roll(i + 2);
            buy(router, token, trader, 10e18);
        }

        uint256 claimableFees = hook.claimableFeeOkb();
        uint256 reserve = address(hook).balance - claimableFees;
        uint256 supplyBefore = token.totalSupply();
        (address pool, uint256 liquidity) = hook.migrateLiquidity("migration-data");

        assertEq(pool, migrationTarget.pool());
        assertEq(liquidity, migrationTarget.liquidity());
        assertEq(address(hook).balance, claimableFees);
        assertEq(migrationTarget.lastOkbAmount(), reserve);
        assertEq(migrationTarget.lastTokenAmount(), 21_000_000e18 - supplyBefore);
        assertEq(token.balanceOf(address(migrationTarget)), 21_000_000e18 - supplyBefore);
        assertTrue(hook.liquidityMigrated());

        uint256 recipientBefore = recipient.balance;
        vm.prank(feeRecipient);
        hook.claimFees(recipient);
        assertEq(recipient.balance - recipientBefore, claimableFees);
    }

    function test_RevertWhen_MigrationRunsTwice() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        for (uint256 i = 0; i < 47; i++) {
            vm.roll(i + 2);
            buy(router, token, trader, 10e18);
        }

        hook.migrateLiquidity("");

        vm.expectRevert(EulrHook.LiquidityAlreadyMigrated.selector);
        hook.migrateLiquidity("");
    }

    function test_RevertWhen_MigrationTargetReturnsInvalidResult() public {
        MockBadMigrationTarget zeroPoolTarget = new MockBadMigrationTarget(address(0), 1e18);
        (EulrToken zeroPoolToken, EulrHook zeroPoolHook,) =
            _createGraduatedToken(deployFactory(feeRecipient, address(zeroPoolTarget)));
        uint256 zeroPoolHookBalance = address(zeroPoolHook).balance;
        uint256 zeroPoolTargetTokenBalance = zeroPoolToken.balanceOf(address(zeroPoolTarget));

        vm.expectRevert(EulrHook.InvalidMigrationResult.selector);
        zeroPoolHook.migrateLiquidity("");
        assertFalse(zeroPoolHook.liquidityMigrated());
        assertEq(address(zeroPoolHook).balance, zeroPoolHookBalance);
        assertEq(zeroPoolToken.balanceOf(address(zeroPoolTarget)), zeroPoolTargetTokenBalance);

        MockBadMigrationTarget zeroLiquidityTarget = new MockBadMigrationTarget(address(0xBEEF), 0);
        (EulrToken zeroLiquidityToken, EulrHook zeroLiquidityHook,) =
            _createGraduatedToken(deployFactory(feeRecipient, address(zeroLiquidityTarget)));
        uint256 zeroLiquidityHookBalance = address(zeroLiquidityHook).balance;
        uint256 zeroLiquidityTargetTokenBalance = zeroLiquidityToken.balanceOf(address(zeroLiquidityTarget));

        vm.expectRevert(EulrHook.InvalidMigrationResult.selector);
        zeroLiquidityHook.migrateLiquidity("");
        assertFalse(zeroLiquidityHook.liquidityMigrated());
        assertEq(address(zeroLiquidityHook).balance, zeroLiquidityHookBalance);
        assertEq(zeroLiquidityToken.balanceOf(address(zeroLiquidityTarget)), zeroLiquidityTargetTokenBalance);
    }

    function _createGraduatedToken(EulrFactory factory_)
        internal
        returns (EulrToken token, EulrHook hook, EulrRouter router)
    {
        vm.prank(creator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            factory_.createToken("Migration", "MIG", "ipfs://migration", "");

        token = EulrToken(tokenAddr);
        hook = EulrHook(payable(hookAddr));
        router = EulrRouter(payable(routerAddr));

        for (uint256 i = 0; i < 47; i++) {
            vm.roll(i + 2);
            buy(router, token, trader, 10e18);
        }
    }
}

contract MockBadMigrationTarget {
    address public immutable pool;
    uint256 public immutable liquidity;

    constructor(address pool_, uint256 liquidity_) {
        pool = pool_;
        liquidity = liquidity_;
    }

    function migrate(address, uint256 okbAmount, uint256, bytes calldata) external payable returns (address, uint256) {
        require(msg.value == okbAmount, "wrong value");
        return (pool, liquidity);
    }
}
