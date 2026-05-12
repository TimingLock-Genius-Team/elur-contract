// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract SatpadTokenTest is SatpadTestBase {
    function test_OnlyHookCanMintAndBurn() public {
        (SatpadToken token,,) = createDemoToken();

        vm.expectRevert(SatpadToken.OnlyHook.selector);
        token.mint(trader, 1e18);

        address hook = token.hook();
        vm.prank(hook);
        token.mint(trader, 1e18);
        assertEq(token.balanceOf(trader), 1e18);

        vm.expectRevert(SatpadToken.OnlyHook.selector);
        token.burn(trader, 1e18);

        vm.prank(hook);
        token.burn(trader, 1e18);
        assertEq(token.balanceOf(trader), 0);
    }

    function test_TransfersHaveNoTax() public {
        (SatpadToken token,,) = createDemoToken();

        vm.prank(token.hook());
        token.mint(trader, 10e18);

        vm.prank(trader);
        assertTrue(token.transfer(recipient, 4e18));

        assertEq(token.balanceOf(trader), 6e18);
        assertEq(token.balanceOf(recipient), 4e18);
        assertEq(token.totalSupply(), 10e18);
    }
}
