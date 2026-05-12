// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract SameBlockProtectionTest is SatpadTestBase {
    function test_SameUserCannotSellInBuyBlockButCanSellNextBlock() public {
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

    function test_DifferentUserIsNotBlockedByBuyersBlock() public {
        (SatpadToken token,, SatpadRouter router) = createDemoToken();
        address seller = makeAddr("seller");

        uint256 sellerTokens = buy(router, token, seller, 1e18);
        vm.roll(block.number + 1);
        buy(router, token, trader, 1e18);

        vm.startPrank(seller);
        token.approve(address(router), sellerTokens / 2);
        router.sell(address(token), sellerTokens / 2, 0, seller);
        vm.stopPrank();
    }

    function test_LastBuyBlockDoesNotCrossTokens() public {
        (SatpadToken tokenA,, SatpadRouter routerA) = createToken("Alpha", "ALPHA", creator);
        (SatpadToken tokenB,, SatpadRouter routerB) = createToken("Beta", "BETA", creator);

        uint256 tokenBAmount = buy(routerB, tokenB, trader, 1e18);
        vm.roll(block.number + 1);
        buy(routerA, tokenA, trader, 1e18);

        vm.startPrank(trader);
        tokenB.approve(address(routerB), tokenBAmount / 2);
        routerB.sell(address(tokenB), tokenBAmount / 2, 0, trader);
        vm.stopPrank();
    }

    function test_FailedBuyDoesNotBlockSell() public {
        (SatpadToken token,, SatpadRouter router) = createDemoToken();
        uint256 tokensOut = buy(router, token, trader, 1e18);
        vm.roll(block.number + 1);

        vm.deal(trader, 1e18);
        vm.prank(trader);
        vm.expectRevert();
        router.buy{value: 1e18}(address(token), type(uint256).max, trader);

        vm.prank(trader);
        token.approve(address(router), tokensOut / 2);
        vm.prank(trader);
        router.sell(address(token), tokensOut / 2, 0, trader);
    }
}
