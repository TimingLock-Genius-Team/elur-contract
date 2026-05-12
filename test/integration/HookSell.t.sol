// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {SellQuote} from "../../src/curve/CurveTypes.sol";
import {Curve} from "../../src/curve/Curve.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract HookSellTest is SatpadTestBase {
    function test_SellBurnsTokensAndPaysNetOkb() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 2e18);

        vm.roll(block.number + 1);
        SellQuote memory quote = hook.quoteSell(tokensOut / 4);
        uint256 balanceBefore = recipient.balance;

        vm.startPrank(trader);
        token.approve(address(router), tokensOut / 4);
        uint256 okbOut = router.sell(address(token), tokensOut / 4, quote.netOkbOut, recipient);
        vm.stopPrank();

        assertEq(okbOut, quote.netOkbOut);
        assertEq(recipient.balance - balanceBefore, quote.netOkbOut);
        assertEq(token.totalSupply(), quote.newMinted);
        assertEq(hook.okbCum(), quote.newOkbCum);
    }

    function test_RevertWhen_SellAmountIsZeroOrExceedsCurveMinted() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();
        buy(router, token, trader, 1e18);
        vm.roll(block.number + 1);

        vm.startPrank(trader);
        token.approve(address(router), type(uint256).max);
        vm.expectRevert(Curve.TokensInZero.selector);
        router.sell(address(token), 0, 0, trader);

        uint256 totalMinted = hook.totalMinted();
        vm.expectRevert();
        router.sell(address(token), totalMinted + 1, 0, trader);
        vm.stopPrank();
    }

    function test_RevertWhen_SellAllowanceOrBalanceMissing() public {
        (SatpadToken token,, SatpadRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 1e18);
        vm.roll(block.number + 1);

        vm.prank(trader);
        vm.expectRevert(SatpadToken.InsufficientAllowance.selector);
        router.sell(address(token), tokensOut / 2, 0, trader);

        address empty = makeAddr("empty");
        vm.prank(empty);
        vm.expectRevert(SatpadToken.InsufficientAllowance.selector);
        router.sell(address(token), 1, 0, empty);
    }

    function test_RevertWhen_SellSlippageTooHighOrReserveMissing() public {
        (SatpadToken token,, SatpadRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 1e18);
        vm.roll(block.number + 1);

        vm.startPrank(trader);
        token.approve(address(router), tokensOut);
        vm.expectRevert(SatpadHook.SlippageExceeded.selector);
        router.sell(address(token), tokensOut / 2, type(uint256).max, trader);
        vm.stopPrank();
    }

    function test_RevertWhen_DirectHookSellCallerIsNotRouter() public {
        (, SatpadHook hook,) = createDemoToken();

        vm.expectRevert(SatpadHook.OnlyRouter.selector);
        hook.sell(trader, trader, 1e18, 0);
    }
}
