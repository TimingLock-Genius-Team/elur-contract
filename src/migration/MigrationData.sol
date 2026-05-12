// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library MigrationData {
    address internal constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    struct Params {
        address currency0;
        address currency1;
        address hooks;
        uint24 poolFee;
        int24 tickSpacing;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 amount0Max;
        uint256 amount1Max;
        uint256 deadline;
        address lpRecipient;
        bytes hookData;
    }

    error InvalidCurrencyOrder();
    error ZeroPoolFee();
    error InvalidTickSpacing();
    error InvalidTickRange();
    error TickSpacingMismatch();
    error ZeroLiquidity();
    error ZeroAmountMax();
    error ExpiredDeadline();
    error UnsafeLpRecipient();

    function decodeAndValidate(bytes calldata data, uint256 currentTimestamp)
        internal
        pure
        returns (Params memory params)
    {
        params = abi.decode(data, (Params));

        if (params.currency0 >= params.currency1) revert InvalidCurrencyOrder();
        if (params.poolFee == 0) revert ZeroPoolFee();
        if (params.tickSpacing <= 0) revert InvalidTickSpacing();
        if (params.tickLower >= params.tickUpper) revert InvalidTickRange();
        if (params.tickLower % params.tickSpacing != 0 || params.tickUpper % params.tickSpacing != 0) {
            revert TickSpacingMismatch();
        }
        if (params.liquidity == 0) revert ZeroLiquidity();
        if (params.amount0Max == 0 || params.amount1Max == 0) revert ZeroAmountMax();
        if (params.deadline < currentTimestamp) revert ExpiredDeadline();
        if (params.lpRecipient != BURN_ADDRESS) revert UnsafeLpRecipient();
    }
}
