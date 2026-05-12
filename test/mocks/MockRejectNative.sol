// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract MockRejectNative {
    receive() external payable {
        revert("reject native");
    }
}
