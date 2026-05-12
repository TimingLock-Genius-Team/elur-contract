// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {BuyQuote} from "../../src/curve/CurveTypes.sol";
import {SatpadFactory} from "../../src/factory/SatpadFactory.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";
import {MockRejectNative} from "../mocks/MockRejectNative.sol";
import {Curve} from "../../src/curve/Curve.sol";

contract HookBuyTest is SatpadTestBase {
    function test_BuyMintsToRecipientAndStoresPayerBlock() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();
        BuyQuote memory quote = hook.quoteBuy(1e18);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        router.buy{value: 1e18}(address(token), quote.tokensOut, recipient);

        assertEq(token.balanceOf(recipient), quote.tokensOut);
        assertEq(token.balanceOf(trader), 0);
        assertEq(hook.lastBuyBlock(trader), block.number);
        assertEq(hook.okbCum(), quote.effectiveOkbIn);
    }

    function test_RevertWhen_BuyValueIsZeroOrTooLarge() public {
        (SatpadToken token,, SatpadRouter router) = createDemoToken();

        vm.prank(trader);
        vm.expectRevert(Curve.GrossOkbInZero.selector);
        router.buy{value: 0}(address(token), 0, trader);

        vm.deal(trader, 10 ether + 1);
        vm.prank(trader);
        vm.expectRevert(Curve.GrossOkbInTooLarge.selector);
        router.buy{value: 10 ether + 1}(address(token), 0, trader);
    }

    function test_RevertWhen_DirectHookBuyCallerIsNotRouter() public {
        (, SatpadHook hook,) = createDemoToken();

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(SatpadHook.OnlyRouter.selector);
        hook.buy{value: 1e18}(trader, trader, 0);
    }

    function test_RevertedBuyDoesNotWriteLastBuyBlock() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(SatpadHook.SlippageExceeded.selector);
        router.buy{value: 1e18}(address(token), type(uint256).max, trader);

        assertEq(hook.lastBuyBlock(trader), 0);
        assertEq(hook.okbCum(), 0);
        assertEq(token.balanceOf(trader), 0);
    }

    function test_RevertWhen_FeeRecipientRejectsNativeOkb() public {
        MockRejectNative rejectNative = new MockRejectNative();
        SatpadFactory rejectingFactory = deployFactory(address(rejectNative));

        vm.prank(creator);
        (address tokenAddr,, address routerAddr) = rejectingFactory.createToken("Reject", "REJ", "ipfs://reject", "");

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert();
        SatpadRouter(payable(routerAddr)).buy{value: 1e18}(tokenAddr, 0, trader);
    }
}
