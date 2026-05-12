// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract TokenIsolationTest is SatpadTestBase {
    function test_EachTokenHasIndependentCurveStateAndBalances() public {
        (SatpadToken tokenA, SatpadHook hookA, SatpadRouter routerA) = createToken("Alpha", "ALPHA", creator);
        (SatpadToken tokenB, SatpadHook hookB, SatpadRouter routerB) = createToken("Beta", "BETA", creator);

        uint256 outA = buy(routerA, tokenA, trader, 1e18);
        uint256 outB = buy(routerB, tokenB, trader, 2e18);

        assertTrue(address(hookA) != address(hookB));
        assertEq(tokenA.balanceOf(trader), outA);
        assertEq(tokenB.balanceOf(trader), outB);
        assertEq(hookA.okbCum(), 0.997e18);
        assertEq(hookB.okbCum(), 1.994e18);
    }

    function test_RouterCannotOperateOnAnotherRegisteredToken() public {
        (SatpadToken tokenA,, SatpadRouter routerA) = createToken("Alpha", "ALPHA", creator);
        (SatpadToken tokenB,,) = createToken("Beta", "BETA", creator);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(SatpadRouter.InvalidToken.selector);
        routerA.buy{value: 1e18}(address(tokenB), 0, trader);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        routerA.buy{value: 1e18}(address(tokenA), 0, trader);
    }

    function test_OtherHookCannotMintOrBurnToken() public {
        (SatpadToken tokenA,,) = createToken("Alpha", "ALPHA", creator);
        (, SatpadHook hookB,) = createToken("Beta", "BETA", creator);

        vm.expectRevert(SatpadToken.OnlyHook.selector);
        vm.prank(address(hookB));
        tokenA.mint(trader, 1e18);

        vm.expectRevert(SatpadToken.OnlyHook.selector);
        vm.prank(address(hookB));
        tokenA.burn(trader, 1e18);
    }
}
