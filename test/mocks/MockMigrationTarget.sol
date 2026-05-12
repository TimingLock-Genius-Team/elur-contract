// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract MockMigrationTarget {
    address public lastToken;
    uint256 public lastOkbAmount;
    uint256 public lastTokenAmount;
    bytes public lastMigrationData;

    address public immutable pool = address(0xBEEF);
    uint256 public immutable liquidity = 1e18;

    event Migrated(address token, uint256 okbAmount, uint256 tokenAmount, bytes migrationData);

    function migrate(address token, uint256 okbAmount, uint256 tokenAmount, bytes calldata migrationData)
        external
        payable
        returns (address, uint256)
    {
        require(msg.value == okbAmount, "wrong value");

        lastToken = token;
        lastOkbAmount = okbAmount;
        lastTokenAmount = tokenAmount;
        lastMigrationData = migrationData;

        emit Migrated(token, okbAmount, tokenAmount, migrationData);
        return (pool, liquidity);
    }
}
