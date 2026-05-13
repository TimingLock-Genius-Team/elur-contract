// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {BuyQuote, SellQuote} from "../../src/curve/CurveTypes.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";

contract RouterSettlementTest is EulrTestBase {
    function test_RouterQuoteMatchesHookQuote() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();

        BuyQuote memory hookBuy = hook.quoteBuy(1e18);
        BuyQuote memory routerBuy = router.quoteBuy(address(token), 1e18);
        assertEq(routerBuy.tokensOut, hookBuy.tokensOut);
        assertEq(routerBuy.newOkbCum, hookBuy.newOkbCum);

        uint256 tokensOut = buy(router, token, trader, 1e18);
        SellQuote memory hookSell = hook.quoteSell(tokensOut / 10);
        SellQuote memory routerSell = router.quoteSell(address(token), tokensOut / 10);
        assertEq(routerSell.netOkbOut, hookSell.netOkbOut);
        assertEq(routerSell.newOkbCum, hookSell.newOkbCum);
    }

    function test_RevertWhen_BuyOrSellRecipientIsZero() public {
        (EulrToken token,, EulrRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 1e18);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(EulrRouter.ZeroAddress.selector);
        router.buy{value: 1e18}(address(token), 0, address(0));

        vm.roll(block.number + 1);
        vm.startPrank(trader);
        token.approve(address(router), tokensOut);
        vm.expectRevert(EulrRouter.ZeroAddress.selector);
        router.sell(address(token), tokensOut / 2, 0, address(0));
        vm.stopPrank();
    }

    function test_RouterNeverRetainsAssetsAfterSuccessfulBuyOrSell() public {
        (EulrToken token,, EulrRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 1e18);

        assertEq(address(router).balance, 0);
        assertEq(token.balanceOf(address(router)), 0);

        vm.roll(block.number + 1);
        vm.startPrank(trader);
        token.approve(address(router), tokensOut / 2);
        router.sell(address(token), tokensOut / 2, 0, trader);
        vm.stopPrank();

        assertEq(address(router).balance, 0);
        assertEq(token.balanceOf(address(router)), 0);
    }

    function test_RevertWhen_RouterReceivesNativeOkbDirectly() public {
        (,, EulrRouter router) = createDemoToken();

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(EulrRouter.InvalidToken.selector);
        payable(address(router)).transfer(1);
    }
}
