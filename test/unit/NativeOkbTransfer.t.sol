// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {NativeOkbTransfer} from "../../src/libraries/NativeOkbTransfer.sol";

contract NativeOkbTransferHarness {
    using NativeOkbTransfer for address;

    function safeTransfer(address recipient, uint256 amount) external {
        recipient.safeTransfer(amount);
    }

    receive() external payable {}
}

contract NativeOkbTransferRejecting {
    receive() external payable {
        revert("reject");
    }
}

contract NativeOkbTransferTest is Test {
    NativeOkbTransferHarness internal harness;

    function setUp() public {
        harness = new NativeOkbTransferHarness();
        vm.deal(address(harness), 10 ether);
    }

    function test_ZeroAmountShortCircuitsWithoutCallingRecipient() public {
        // A reverting recipient still succeeds for a zero-amount transfer
        // because the library never issues the underlying call when the
        // amount is zero. This protects callers that drain a balance into a
        // recipient that happens to be a no-receive contract.
        NativeOkbTransferRejecting rejector = new NativeOkbTransferRejecting();

        uint256 senderBalanceBefore = address(harness).balance;
        uint256 recipientBalanceBefore = address(rejector).balance;

        harness.safeTransfer(address(rejector), 0);

        assertEq(address(harness).balance, senderBalanceBefore);
        assertEq(address(rejector).balance, recipientBalanceBefore);
    }

    function test_NonZeroAmountFowardsNativeOkbToRecipient() public {
        address recipient = makeAddr("recipient");
        uint256 amount = 1 ether;

        harness.safeTransfer(recipient, amount);

        assertEq(recipient.balance, amount);
    }

    function test_RevertWhen_RecipientRejectsNativeOkb() public {
        NativeOkbTransferRejecting rejector = new NativeOkbTransferRejecting();

        vm.expectRevert(
            abi.encodeWithSelector(NativeOkbTransfer.NativeOkbTransferFailed.selector, address(rejector), 1 ether)
        );
        harness.safeTransfer(address(rejector), 1 ether);
    }
}
