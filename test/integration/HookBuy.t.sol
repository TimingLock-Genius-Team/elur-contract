// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {BuyQuote} from "../../src/curve/CurveTypes.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {MockRejectNative} from "../mocks/MockRejectNative.sol";
import {Curve} from "../../src/curve/Curve.sol";

contract HookBuyTest is EulrTestBase {
    function test_BuyMintsToRecipientAndStoresPayerBlock() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        BuyQuote memory quote = hook.quoteBuy(1e18);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        router.buy{value: 1e18}(address(token), quote.tokensOut, recipient);

        assertEq(token.balanceOf(recipient), quote.tokensOut);
        assertEq(hook.taxBurnedTokens(), quote.burnTaxTokens);
        assertEq(token.totalSupply() + hook.taxBurnedTokens(), quote.grossTokensOut);
        assertEq(token.balanceOf(trader), 0);
        assertEq(hook.lastBuyBlock(trader), block.number);
        assertEq(hook.okbCum(), quote.effectiveOkbIn);
    }

    function test_RevertWhen_BuyValueIsZeroOrTooLarge() public {
        (EulrToken token,, EulrRouter router) = createDemoToken();

        vm.prank(trader);
        vm.expectRevert(Curve.GrossOkbInZero.selector);
        router.buy{value: 0}(address(token), 0, trader);

        vm.deal(trader, 10 ether + 1);
        vm.prank(trader);
        vm.expectRevert(Curve.GrossOkbInTooLarge.selector);
        router.buy{value: 10 ether + 1}(address(token), 0, trader);
    }

    function test_RevertWhen_DirectHookBuyCallerIsNotRouter() public {
        (, EulrHook hook,) = createDemoToken();

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(EulrHook.OnlyRouter.selector);
        hook.buy{value: 1e18}(trader, trader, 0);
    }

    function test_RevertedBuyDoesNotWriteLastBuyBlock() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(EulrHook.SlippageExceeded.selector);
        router.buy{value: 1e18}(address(token), type(uint256).max, trader);

        assertEq(hook.lastBuyBlock(trader), 0);
        assertEq(hook.okbCum(), 0);
        assertEq(token.balanceOf(trader), 0);
    }

    function test_BuySucceedsWhenFeeRecipientRejectsNativeOkb() public {
        MockRejectNative rejectNative = new MockRejectNative();
        EulrFactory rejectingFactory = deployFactory(address(rejectNative));

        vm.prank(creator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            rejectingFactory.createToken("Reject", "REJ", "ipfs://reject", "");
        EulrHook hook = EulrHook(payable(hookAddr));
        BuyQuote memory quote = hook.quoteBuy(1e18);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        EulrRouter(payable(routerAddr)).buy{value: 1e18}(tokenAddr, 0, trader);

        assertEq(hook.okbCum(), quote.effectiveOkbIn);
        assertEq(hook.claimableFeeOkb(), quote.fee);
    }
}
