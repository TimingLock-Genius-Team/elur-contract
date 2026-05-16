// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";

contract SelfDeprecationTest is EulrTestBase {
    event SelfDeprecated(address indexed token, uint256 okbCum, uint256 minted);

    function test_BuyBeforeThresholdDoesNotDeprecate() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();

        buy(router, token, trader, 10e18);

        assertFalse(hook.selfDeprecated());
    }

    function test_ThresholdBuySetsSelfDeprecatedAndEmitsEvent() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();

        for (uint256 i = 0; i < GRADUATION_10OKB_BUYS_BEFORE_THRESHOLD; i++) {
            vm.roll(i + 2);
            buy(router, token, trader, 10e18);
        }

        vm.roll(100);
        vm.expectEmit(true, false, false, false, address(hook));
        emit SelfDeprecated(address(token), 0, 0);
        buy(router, token, trader, 10e18);

        assertTrue(hook.selfDeprecated());
    }

    function test_BuyStaysClosedAfterSelfDeprecatedButSellWorks() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        uint256 bought;
        for (uint256 i = 0; i < GRADUATION_10OKB_BUYS; i++) {
            vm.roll(i + 2);
            bought += buy(router, token, trader, 10e18);
        }

        assertTrue(hook.selfDeprecated());

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(EulrHook.SelfDeprecatedBuyClosed.selector);
        router.buy{value: 1e18}(address(token), 0, trader);

        vm.roll(100);
        vm.startPrank(trader);
        token.approve(address(router), bought / 100);
        router.sell(address(token), bought / 100, 0, trader);
        vm.stopPrank();
    }
}
