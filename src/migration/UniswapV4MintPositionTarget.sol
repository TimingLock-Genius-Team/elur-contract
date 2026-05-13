// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseUniswapV4MigrationTarget} from "./BaseUniswapV4MigrationTarget.sol";
import {MigrationData} from "./MigrationData.sol";
import {UniswapV4PoolKey} from "./UniswapV4PoolKey.sol";

interface IUniswapV4PositionManagerMinimal {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function nextTokenId() external view returns (uint256);
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
}

interface IERC20ApproveAllowance {
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract UniswapV4MintPositionTarget is BaseUniswapV4MigrationTarget {
    uint8 internal constant ACTION_MINT_POSITION = 0x02;
    uint8 internal constant ACTION_SETTLE_PAIR = 0x0d;
    uint8 internal constant ACTION_SWEEP = 0x14;

    event UniswapV4PositionMinted(
        address indexed token,
        bytes32 indexed poolId,
        uint256 indexed positionId,
        uint128 liquidity,
        address lpRecipient
    );

    error AmountMaxTooLarge();
    error TokenApprovalFailed();
    error ResidualToken();
    error UnauthorizedMigrationPool();
    error UnauthorizedHookData();

    address public immutable expectedHooks;
    uint24 public immutable expectedPoolFee;
    int24 public immutable expectedTickSpacing;
    int24 public immutable expectedTickLower;
    int24 public immutable expectedTickUpper;
    bytes32 public immutable expectedHookDataHash;

    constructor(
        address poolManager_,
        address positionManager_,
        address lpRecipient_,
        address expectedHooks_,
        uint24 expectedPoolFee_,
        int24 expectedTickSpacing_,
        int24 expectedTickLower_,
        int24 expectedTickUpper_,
        bytes32 expectedHookDataHash_
    ) BaseUniswapV4MigrationTarget(poolManager_, positionManager_, lpRecipient_) {
        expectedHooks = expectedHooks_;
        expectedPoolFee = expectedPoolFee_;
        expectedTickSpacing = expectedTickSpacing_;
        expectedTickLower = expectedTickLower_;
        expectedTickUpper = expectedTickUpper_;
        expectedHookDataHash = expectedHookDataHash_;
    }

    function _migrateValidated(
        address token,
        uint256 okbAmount,
        uint256 tokenAmount,
        MigrationData.Params memory params
    ) internal override nonReentrant returns (address pool, uint256 positionId, uint128 liquidity) {
        if (params.amount0Max > type(uint128).max || params.amount1Max > type(uint128).max) {
            revert AmountMaxTooLarge();
        }
        _validatePoolAllowlist(params);

        UniswapV4PoolKey.Key memory key = UniswapV4PoolKey.fromMigrationData(params);
        bytes32 poolId = UniswapV4PoolKey.toId(key);
        IUniswapV4PositionManagerMinimal posm = IUniswapV4PositionManagerMinimal(positionManager);
        positionId = posm.nextTokenId();

        if (!IERC20ApproveAllowance(token).approve(positionManager, tokenAmount)) revert TokenApprovalFailed();
        posm.modifyLiquidities{value: okbAmount}(_encodeModifyLiquidities(key, params), params.deadline);
        if (IERC20ApproveAllowance(token).allowance(address(this), positionManager) != 0) revert ResidualToken();
        if (!IERC20ApproveAllowance(token).approve(positionManager, 0)) revert TokenApprovalFailed();

        liquidity = posm.getPositionLiquidity(positionId);

        emit UniswapV4PositionMinted(token, poolId, positionId, liquidity, lpRecipient);
        return (poolManager, positionId, liquidity);
    }

    function _encodeModifyLiquidities(UniswapV4PoolKey.Key memory key, MigrationData.Params memory params)
        internal
        view
        returns (bytes memory)
    {
        bytes memory actions = abi.encodePacked(ACTION_MINT_POSITION, ACTION_SETTLE_PAIR, ACTION_SWEEP);
        bytes[] memory actionParams = new bytes[](3);
        actionParams[0] = abi.encode(
            key,
            params.tickLower,
            params.tickUpper,
            uint256(params.liquidity),
            uint128(params.amount0Max),
            uint128(params.amount1Max),
            lpRecipient,
            params.hookData
        );
        actionParams[1] = abi.encode(key.currency0, key.currency1);
        actionParams[2] = abi.encode(key.currency0, address(this));

        return abi.encode(actions, actionParams);
    }

    function _validatePoolAllowlist(MigrationData.Params memory params) internal view {
        if (
            params.hooks != expectedHooks || params.poolFee != expectedPoolFee
                || params.tickSpacing != expectedTickSpacing || params.tickLower != expectedTickLower
                || params.tickUpper != expectedTickUpper
        ) {
            revert UnauthorizedMigrationPool();
        }
        if (keccak256(params.hookData) != expectedHookDataHash) {
            revert UnauthorizedHookData();
        }
    }
}
