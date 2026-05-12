// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ISatpadFactory {
    struct TokenInfo {
        address token;
        address hook;
        address router;
        address creator;
        string metadataURI;
        string socialURI;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI
    ) external returns (address token, address hook, address router);

    function allTokensLength() external view returns (uint256);
    function getTokenInfo(address token) external view returns (TokenInfo memory);
    function isToken(address token) external view returns (bool);
}
