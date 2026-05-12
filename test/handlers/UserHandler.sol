// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BuyQuote} from "../../src/curve/CurveTypes.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract UserHandler is Test {
    SatpadToken public token;
    SatpadHook public hook;
    SatpadRouter public router;

    address[] public users;
    uint256 public ghostFeeCollected;

    constructor(SatpadToken token_, SatpadHook hook_, SatpadRouter router_) {
        token = token_;
        hook = hook_;
        router = router_;

        users.push(makeAddr("handler-user-0"));
        users.push(makeAddr("handler-user-1"));
        users.push(makeAddr("handler-user-2"));
    }

    function buy(uint256 userSeed, uint256 okbIn) external {
        if (hook.selfDeprecated()) {
            return;
        }

        address user = users[bound(userSeed, 0, users.length - 1)];
        okbIn = bound(okbIn, 1, 10e18);
        BuyQuote memory quote = hook.quoteBuy(okbIn);

        vm.deal(user, okbIn);
        vm.prank(user);
        try router.buy{value: okbIn}(address(token), 0, user) returns (uint256) {
            ghostFeeCollected += quote.fee;
        } catch {}
    }

    function sell(uint256 userSeed, uint256 tokenSeed) external {
        address user = users[bound(userSeed, 0, users.length - 1)];
        uint256 balance = token.balanceOf(user);
        if (balance == 0) {
            return;
        }

        uint256 tokensIn = bound(tokenSeed, 1, balance);
        vm.roll(block.number + 1);

        vm.startPrank(user);
        token.approve(address(router), tokensIn);
        try router.sell(address(token), tokensIn, 0, user) returns (uint256) {} catch {}
        vm.stopPrank();
    }
}
