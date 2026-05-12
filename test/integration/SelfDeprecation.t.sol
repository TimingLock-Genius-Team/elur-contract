// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract SelfDeprecationTest is SatpadTestBase {
    event SelfDeprecated(address indexed token, uint256 okbCum, uint256 minted);

    function test_BuyBeforeThresholdDoesNotDeprecate() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();

        buy(router, token, trader, 10e18);

        assertFalse(hook.selfDeprecated());
    }

    function test_ThresholdBuySetsSelfDeprecatedAndEmitsEvent() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();

        for (uint256 i = 0; i < 46; i++) {
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
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();
        uint256 bought;
        for (uint256 i = 0; i < 47; i++) {
            vm.roll(i + 2);
            bought += buy(router, token, trader, 10e18);
        }

        assertTrue(hook.selfDeprecated());

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert(SatpadHook.SelfDeprecatedBuyClosed.selector);
        router.buy{value: 1e18}(address(token), 0, trader);

        vm.roll(100);
        vm.startPrank(trader);
        token.approve(address(router), bought / 100);
        router.sell(address(token), bought / 100, 0, trader);
        vm.stopPrank();
    }
}
