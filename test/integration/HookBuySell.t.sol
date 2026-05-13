// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {MockRejectNative} from "../mocks/MockRejectNative.sol";
import {BuyQuote, SellQuote} from "../../src/curve/CurveTypes.sol";
import {IEulrHook} from "../../src/interfaces/IEulrHook.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";

contract HookBuySellTest is EulrTestBase {
    function test_BuyUsesEffectiveOkbForCurveAndAccruesFee() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();

        BuyQuote memory quote = hook.quoteBuy(1e18);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        uint256 tokensOut = router.buy{value: 1e18}(address(token), quote.tokensOut, recipient);

        assertEq(tokensOut, quote.tokensOut);
        assertEq(hook.okbCum(), quote.effectiveOkbIn);
        assertEq(hook.lastBuyBlock(trader), block.number);
        assertEq(token.balanceOf(recipient), quote.tokensOut);
        assertEq(hook.claimableFeeOkb(), quote.fee);
        assertEq(address(router).balance, 0);
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(address(hook).balance, quote.effectiveOkbIn + quote.fee);
    }

    function test_RevertWhen_BuySlippageOrMaxBuyFails() public {
        (EulrToken token,, EulrRouter router) = createDemoToken();

        vm.deal(trader, 11e18);
        vm.prank(trader);
        vm.expectRevert();
        router.buy{value: 11e18}(address(token), 0, trader);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(EulrHook.SlippageExceeded.selector);
        router.buy{value: 1e18}(address(token), type(uint256).max, trader);
    }

    function test_SellReducesOkbCumPaysRecipientAndAccruesFee() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 2e18);

        vm.roll(block.number + 1);
        SellQuote memory quote = hook.quoteSell(tokensOut / 2);
        uint256 claimableBefore = hook.claimableFeeOkb();
        uint256 recipientBefore = recipient.balance;

        vm.startPrank(trader);
        token.approve(address(router), tokensOut / 2);
        uint256 okbOut = router.sell(address(token), tokensOut / 2, quote.netOkbOut, recipient);
        vm.stopPrank();

        assertEq(okbOut, quote.netOkbOut);
        assertEq(hook.okbCum(), quote.newOkbCum);
        assertEq(recipient.balance - recipientBefore, quote.netOkbOut);
        assertEq(hook.claimableFeeOkb() - claimableBefore, quote.fee);
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function test_FeeRecipientCanClaimAccruedFees() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        BuyQuote memory quote = hook.quoteBuy(1e18);
        buy(router, token, trader, 1e18);

        uint256 recipientBefore = recipient.balance;

        vm.prank(feeRecipient);
        hook.claimFees(recipient);

        assertEq(recipient.balance - recipientBefore, quote.fee);
        assertEq(hook.claimableFeeOkb(), 0);
        assertEq(address(hook).balance, hook.okbCum());
    }

    function test_RevertWhen_NonFeeRecipientClaimsFees() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        buy(router, token, trader, 1e18);

        vm.prank(trader);
        vm.expectRevert(EulrHook.OnlyFeeRecipient.selector);
        hook.claimFees(trader);
    }

    function test_RevertWhen_ClaimFeesRecipientIsZero() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        buy(router, token, trader, 1e18);

        vm.prank(feeRecipient);
        vm.expectRevert(EulrHook.ZeroAddress.selector);
        hook.claimFees(address(0));
    }

    function test_RevertWhen_ClaimFeesWithoutAccruedFees() public {
        (, EulrHook hook,) = createDemoToken();

        vm.prank(feeRecipient);
        vm.expectRevert(EulrHook.NoClaimableFees.selector);
        hook.claimFees(recipient);
    }

    function test_RevertWhen_ClaimFeesRecipientRejectsNativeOkbAndPreservesFees() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        MockRejectNative rejectNative = new MockRejectNative();
        buy(router, token, trader, 1e18);

        uint256 claimableBefore = hook.claimableFeeOkb();

        vm.prank(feeRecipient);
        vm.expectRevert();
        hook.claimFees(address(rejectNative));

        assertEq(hook.claimableFeeOkb(), claimableBefore);
        assertEq(address(hook).balance, hook.okbCum() + claimableBefore);

        vm.prank(feeRecipient);
        hook.claimFees(recipient);

        assertEq(hook.claimableFeeOkb(), 0);
    }

    function test_SameBlockSellProtectionIsPerUser() public {
        (EulrToken token,, EulrRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 1e18);

        vm.startPrank(trader);
        token.approve(address(router), tokensOut);
        vm.expectRevert(EulrHook.SameBlockSell.selector);
        router.sell(address(token), tokensOut / 2, 0, trader);
        vm.stopPrank();

        vm.roll(block.number + 1);
        vm.prank(trader);
        router.sell(address(token), tokensOut / 2, 0, trader);
    }

    function test_RevertWhen_RouterUsesUnregisteredToken() public {
        (EulrToken token,, EulrRouter router) = createDemoToken();
        EulrToken fake = new EulrToken("Fake", "FAKE", address(this));

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(EulrRouter.InvalidToken.selector);
        router.buy{value: 1e18}(address(fake), 0, trader);

        assertEq(token.balanceOf(address(router)), 0);
    }

    function test_CurveStateReturnsFrontendReadyTokenSnapshot() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        BuyQuote memory quote = hook.quoteBuy(1e18);

        buy(router, token, trader, 1e18);

        IEulrHook.CurveState memory state = hook.curveState();
        assertEq(state.okbCum, quote.effectiveOkbIn);
        assertEq(state.totalMinted, hook.totalMinted());
        assertEq(state.currentPrice, hook.currentPrice());
        assertEq(state.claimableFeeOkb, quote.fee);
        assertFalse(state.selfDeprecated);
        assertFalse(state.liquidityMigrated);
    }
}
