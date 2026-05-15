// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {SellQuote} from "../../src/curve/CurveTypes.sol";
import {Curve} from "../../src/curve/Curve.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract HookSellTest is EulrTestBase {
    function test_SellBurnsTokensAndPaysNetOkb() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
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
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
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
        (EulrToken token,, EulrRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 1e18);
        vm.roll(block.number + 1);

        vm.prank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(router), 0, tokensOut / 2)
        );
        router.sell(address(token), tokensOut / 2, 0, trader);

        address empty = makeAddr("empty");
        vm.prank(empty);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(router), 0, 1));
        router.sell(address(token), 1, 0, empty);
    }

    function test_RevertWhen_SellSlippageTooHighOrReserveMissing() public {
        (EulrToken token,, EulrRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 1e18);
        vm.roll(block.number + 1);

        vm.startPrank(trader);
        token.approve(address(router), tokensOut);
        vm.expectRevert(EulrHook.SlippageExceeded.selector);
        router.sell(address(token), tokensOut / 2, type(uint256).max, trader);
        vm.stopPrank();
    }

    function test_RevertWhen_DirectHookSellCallerIsNotRouter() public {
        (, EulrHook hook,) = createDemoToken();

        vm.expectRevert(EulrHook.OnlyRouter.selector);
        hook.sell(trader, trader, 1e18, 0);
    }
}
