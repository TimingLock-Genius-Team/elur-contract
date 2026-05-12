// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {SatpadFactory} from "../../src/factory/SatpadFactory.sol";
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
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();
        for (uint256 i = 0; i < 47; i++) {
            vm.roll(i + 2);
            buy(router, token, trader, 10e18);
        }

        hook.migrateLiquidity("");

        vm.expectRevert(SatpadHook.LiquidityAlreadyMigrated.selector);
        hook.migrateLiquidity("");
    }

    function test_RevertWhen_MigrationTargetReturnsInvalidResult() public {
        MockBadMigrationTarget zeroPoolTarget = new MockBadMigrationTarget(address(0), 1e18);
        (, SatpadHook zeroPoolHook,) = _createGraduatedToken(new SatpadFactory(feeRecipient, address(zeroPoolTarget)));

        vm.expectRevert(SatpadHook.InvalidMigrationResult.selector);
        zeroPoolHook.migrateLiquidity("");

        MockBadMigrationTarget zeroLiquidityTarget = new MockBadMigrationTarget(address(0xBEEF), 0);
        (, SatpadHook zeroLiquidityHook,) =
            _createGraduatedToken(new SatpadFactory(feeRecipient, address(zeroLiquidityTarget)));

        vm.expectRevert(SatpadHook.InvalidMigrationResult.selector);
        zeroLiquidityHook.migrateLiquidity("");
    }

    function _createGraduatedToken(SatpadFactory factory_)
        internal
        returns (SatpadToken token, SatpadHook hook, SatpadRouter router)
    {
        vm.prank(creator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            factory_.createToken("Migration", "MIG", "ipfs://migration", "");

        token = SatpadToken(tokenAddr);
        hook = SatpadHook(payable(hookAddr));
        router = SatpadRouter(payable(routerAddr));

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
