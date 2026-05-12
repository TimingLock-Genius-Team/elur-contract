// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library NativeOkbTransfer {
    error NativeOkbTransferFailed(address recipient, uint256 amount);

    function safeTransfer(address recipient, uint256 amount) internal {
        if (amount == 0) {
            return;
        }

        (bool success,) = recipient.call{value: amount}("");
        if (!success) {
            revert NativeOkbTransferFailed(recipient, amount);
        }
    }
}
