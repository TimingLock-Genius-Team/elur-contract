// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {BuyQuote, SellQuote} from "../../src/curve/CurveTypes.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract HookBuySellTest is SatpadTestBase {
    function test_BuyUsesEffectiveOkbForCurveAndTransfersFee() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();

        BuyQuote memory quote = hook.quoteBuy(1e18);
        uint256 feeBefore = feeRecipient.balance;

        vm.deal(trader, 1e18);
        vm.prank(trader);
        uint256 tokensOut = router.buy{value: 1e18}(address(token), quote.tokensOut, recipient);

        assertEq(tokensOut, quote.tokensOut);
        assertEq(hook.okbCum(), quote.effectiveOkbIn);
        assertEq(hook.lastBuyBlock(trader), block.number);
        assertEq(token.balanceOf(recipient), quote.tokensOut);
        assertEq(feeRecipient.balance - feeBefore, quote.fee);
        assertEq(address(router).balance, 0);
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(address(hook).balance, quote.effectiveOkbIn);
    }

    function test_RevertWhen_BuySlippageOrMaxBuyFails() public {
        (SatpadToken token,, SatpadRouter router) = createDemoToken();

        vm.deal(trader, 11e18);
        vm.prank(trader);
        vm.expectRevert();
        router.buy{value: 11e18}(address(token), 0, trader);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(SatpadHook.SlippageExceeded.selector);
        router.buy{value: 1e18}(address(token), type(uint256).max, trader);
    }

    function test_SellReducesOkbCumPaysRecipientAndFee() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 2e18);

        vm.roll(block.number + 1);
        SellQuote memory quote = hook.quoteSell(tokensOut / 2);
        uint256 feeBefore = feeRecipient.balance;
        uint256 recipientBefore = recipient.balance;

        vm.startPrank(trader);
        token.approve(address(router), tokensOut / 2);
        uint256 okbOut = router.sell(address(token), tokensOut / 2, quote.netOkbOut, recipient);
        vm.stopPrank();

        assertEq(okbOut, quote.netOkbOut);
        assertEq(hook.okbCum(), quote.newOkbCum);
        assertEq(recipient.balance - recipientBefore, quote.netOkbOut);
        assertEq(feeRecipient.balance - feeBefore, quote.fee);
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function test_SameBlockSellProtectionIsPerUser() public {
        (SatpadToken token,, SatpadRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 1e18);

        vm.startPrank(trader);
        token.approve(address(router), tokensOut);
        vm.expectRevert(SatpadHook.SameBlockSell.selector);
        router.sell(address(token), tokensOut / 2, 0, trader);
        vm.stopPrank();

        vm.roll(block.number + 1);
        vm.prank(trader);
        router.sell(address(token), tokensOut / 2, 0, trader);
    }

    function test_RevertWhen_RouterUsesUnregisteredToken() public {
        (SatpadToken token,, SatpadRouter router) = createDemoToken();
        SatpadToken fake = new SatpadToken("Fake", "FAKE", address(this));

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(SatpadRouter.InvalidToken.selector);
        router.buy{value: 1e18}(address(fake), 0, trader);

        assertEq(token.balanceOf(address(router)), 0);
    }
}
