// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IEulrFactory {
    event TokenCreated(
        address indexed token,
        address indexed hook,
        address router,
        address indexed creator,
        string metadataURI,
        string socialURI,
        uint16 curveS
    );
    event TokenV4MigrationProfileBound(
        address indexed token, uint256 indexed profileId, address indexed hooks, address migrationTarget
    );

    struct TokenInfo {
        address token;
        address hook;
        address router;
        address creator;
        string metadataURI;
        string socialURI;
    }

    struct V4MigrationProfile {
        uint256 hookRegistryEntryId;
        address migrationTarget;
        address hooks;
        uint24 poolFee;
        int24 tickSpacing;
        int24 tickLower;
        int24 tickUpper;
        bytes32 hookDataHash;
        bool active;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI
    ) external returns (address token, address hook, address router);

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS
    ) external returns (address token, address hook, address router);

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint16 feeBps,
        uint16 burnTaxMinBps,
        uint16 burnTaxMaxBps
    ) external returns (address token, address hook, address router);

    function createTokenWithV4MigrationProfile(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint256 profileId
    ) external payable returns (address token, address hook, address router);

    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint256 minTokensOut,
        address recipient
    ) external payable returns (address token, address hook, address router);

    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint16 feeBps,
        uint16 burnTaxMinBps,
        uint16 burnTaxMaxBps,
        uint256 minTokensOut,
        address recipient
    ) external payable returns (address token, address hook, address router);

    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint256 minTokensOut,
        address recipient
    ) external payable returns (address token, address hook, address router);

    function createTokenAndBuyWithV4MigrationProfile(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint256 profileId,
        uint256 minTokensOut,
        address recipient
    ) external payable returns (address token, address hook, address router);

    function allTokensLength() external view returns (uint256);
    function getTokens(uint256 offset, uint256 limit) external view returns (address[] memory tokens);
    function getTokenInfo(address token) external view returns (TokenInfo memory);
    function getV4MigrationProfile(uint256 profileId) external view returns (V4MigrationProfile memory);
    function registerV4MigrationProfile(V4MigrationProfile calldata profile) external returns (uint256 profileId);
    function setV4MigrationProfileActive(uint256 profileId, bool active) external;
    function tokenV4MigrationProfileId(address token) external view returns (uint256);
    function nextV4MigrationProfileId() external view returns (uint256);
    function isToken(address token) external view returns (bool);
    function hookImplementation() external view returns (address);
    function hookRegistry() external view returns (address);
    function setHookImplementation(address newHookImplementation) external;
    function setHookRegistry(address newHookRegistry) external;
}
