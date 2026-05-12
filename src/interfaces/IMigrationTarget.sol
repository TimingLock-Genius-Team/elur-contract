// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IMigrationTarget {
    function migrate(address token, uint256 okbAmount, uint256 tokenAmount, bytes calldata migrationData)
        external
        payable
        returns (address pool, uint256 liquidity);
}
