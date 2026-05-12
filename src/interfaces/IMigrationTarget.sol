// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Adapter boundary for moving graduated SATPAD liquidity into an external venue.
/// @dev The returned `liquidity` is only the adapter's migration result. It is not, by itself,
/// proof that LP ownership was burned or locked. Production adapters must emit their own
/// verifiable LP custody event and fork tests must prove the team EOA cannot recover the LP.
interface IMigrationTarget {
    function migrate(address token, uint256 okbAmount, uint256 tokenAmount, bytes calldata migrationData)
        external
        payable
        returns (address pool, uint256 liquidity);
}
