// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IMigrationTarget} from "../interfaces/IMigrationTarget.sol";
import {MigrationData} from "./MigrationData.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// slither-disable-next-line locked-ether
abstract contract BaseUniswapV4MigrationTarget is IMigrationTarget, ReentrancyGuard {
    address public immutable poolManager;
    address public immutable positionManager;
    address public immutable lpRecipient;

    event LpCustodyProven(
        address indexed token, address indexed pool, uint256 indexed positionId, uint256 liquidity, address lpRecipient
    );

    error ZeroAddress();
    error DependencyHasNoCode();
    error InvalidOkbValue();
    error ZeroMigrationAmount();
    error InvalidPoolCurrencies();
    error AmountMaxExceeded();
    error InvalidMigrationResult();
    error ResidualOkb();

    constructor(address poolManager_, address positionManager_, address lpRecipient_) {
        if (poolManager_ == address(0) || positionManager_ == address(0) || lpRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        if (poolManager_.code.length == 0 || positionManager_.code.length == 0) {
            revert DependencyHasNoCode();
        }

        poolManager = poolManager_;
        positionManager = positionManager_;
        lpRecipient = lpRecipient_;
    }

    function migrate(address token, uint256 okbAmount, uint256 tokenAmount, bytes calldata migrationData)
        external
        payable
        returns (address pool, uint256 liquidity)
    {
        if (msg.value != okbAmount) revert InvalidOkbValue();
        if (token == address(0) || okbAmount == 0 || tokenAmount == 0) revert ZeroMigrationAmount();

        MigrationData.Params memory params =
            MigrationData.decodeAndValidate(migrationData, block.timestamp, lpRecipient);
        if (params.currency0 != address(0) || params.currency1 != token) revert InvalidPoolCurrencies();
        if (okbAmount > params.amount0Max || tokenAmount > params.amount1Max) revert AmountMaxExceeded();

        uint256 nativeBalanceBefore = address(this).balance - msg.value;
        uint256 positionId;
        (pool, positionId, liquidity) = _migrateValidated(token, okbAmount, tokenAmount, params);
        if (pool == address(0) || liquidity == 0) revert InvalidMigrationResult();
        if (address(this).balance > nativeBalanceBefore) revert ResidualOkb();

        emit LpCustodyProven(token, pool, positionId, liquidity, lpRecipient);
    }

    function _migrateValidated(
        address token,
        uint256 okbAmount,
        uint256 tokenAmount,
        MigrationData.Params memory params
    ) internal virtual returns (address pool, uint256 positionId, uint128 liquidity);
}
