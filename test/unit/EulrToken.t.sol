// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract EulrTokenTest is EulrTestBase {
    function test_RevertWhen_ConstructorFactoryIsZero() public {
        vm.expectRevert(EulrToken.ZeroAddress.selector);
        new EulrToken("Demo", "DEMO", address(0));
    }

    function test_SetHookValidatesFactoryZeroAddressAndOneTimeBinding() public {
        EulrToken token = new EulrToken("Demo", "DEMO", address(this));

        vm.prank(trader);
        vm.expectRevert(EulrToken.OnlyFactory.selector);
        token.setHook(address(0xBEEF));

        vm.expectRevert(EulrToken.ZeroAddress.selector);
        token.setHook(address(0));

        token.setHook(address(this));
        assertEq(token.hook(), address(this));

        vm.expectRevert(EulrToken.HookAlreadySet.selector);
        token.setHook(address(0xBEEF));
    }

    function test_OnlyHookCanMintAndBurn() public {
        (EulrToken token,,) = createDemoToken();

        vm.expectRevert(EulrToken.OnlyHook.selector);
        token.mint(trader, 1e18);

        address hook = token.hook();
        vm.prank(hook);
        token.mint(trader, 1e18);
        assertEq(token.balanceOf(trader), 1e18);

        vm.expectRevert(EulrToken.OnlyHook.selector);
        token.burn(trader, 1e18);

        vm.prank(hook);
        token.burn(trader, 1e18);
        assertEq(token.balanceOf(trader), 0);
    }

    function test_TransfersHaveNoTax() public {
        (EulrToken token,,) = createDemoToken();

        vm.prank(token.hook());
        token.mint(trader, 10e18);

        vm.prank(trader);
        assertTrue(token.transfer(recipient, 4e18));

        assertEq(token.balanceOf(trader), 6e18);
        assertEq(token.balanceOf(recipient), 4e18);
        assertEq(token.totalSupply(), 10e18);
    }

    function test_RevertWhen_ApproveMintBurnOrTransferInputsAreInvalid() public {
        EulrToken token = new EulrToken("Demo", "DEMO", address(this));
        token.setHook(address(this));

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidSpender.selector, address(0)));
        token.approve(address(0), 1e18);

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        token.mint(address(0), 1e18);

        token.mint(trader, 1e18);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        token.transfer(address(0), 1);

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, trader, 1e18, 2e18));
        token.burn(trader, 2e18);
    }
}
