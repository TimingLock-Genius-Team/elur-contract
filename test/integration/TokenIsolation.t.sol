// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";

contract TokenIsolationTest is EulrTestBase {
    function test_EachTokenHasIndependentCurveStateAndBalances() public {
        (EulrToken tokenA, EulrHook hookA, EulrRouter routerA) = createToken("Alpha", "ALPHA", creator);
        (EulrToken tokenB, EulrHook hookB, EulrRouter routerB) = createToken("Beta", "BETA", creator);

        uint256 outA = buy(routerA, tokenA, trader, 1e18);
        uint256 outB = buy(routerB, tokenB, trader, 2e18);

        assertTrue(address(hookA) != address(hookB));
        assertEq(tokenA.balanceOf(trader), outA);
        assertEq(tokenB.balanceOf(trader), outB);
        assertEq(hookA.okbCum(), 0.997e18);
        assertEq(hookB.okbCum(), 1.994e18);
    }

    function test_RouterCannotOperateOnAnotherRegisteredToken() public {
        (EulrToken tokenA,, EulrRouter routerA) = createToken("Alpha", "ALPHA", creator);
        (EulrToken tokenB,,) = createToken("Beta", "BETA", creator);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(EulrRouter.InvalidToken.selector);
        routerA.buy{value: 1e18}(address(tokenB), 0, trader);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        routerA.buy{value: 1e18}(address(tokenA), 0, trader);
    }

    function test_OtherHookCannotMintOrBurnToken() public {
        (EulrToken tokenA,,) = createToken("Alpha", "ALPHA", creator);
        (, EulrHook hookB,) = createToken("Beta", "BETA", creator);

        vm.expectRevert(EulrToken.OnlyHook.selector);
        vm.prank(address(hookB));
        tokenA.mint(trader, 1e18);

        vm.expectRevert(EulrToken.OnlyHook.selector);
        vm.prank(address(hookB));
        tokenA.burn(trader, 1e18);
    }
}
