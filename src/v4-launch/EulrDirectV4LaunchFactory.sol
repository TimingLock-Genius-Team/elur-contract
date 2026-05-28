// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IEulrHookRegistry} from "../interfaces/IEulrHookRegistry.sol";
import {EulrToken} from "../token/EulrToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

interface IDirectV4InitialLiquidityTarget {
    function addInitialLiquidity(
        PoolKey calldata key,
        address token,
        uint256 tokenAmount,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        address lpRecipient,
        bytes calldata hookData
    ) external payable returns (uint256 positionId, uint128 liquidityAdded);
}

contract EulrDirectV4LaunchFactory {
    using SafeERC20 for IERC20;

    struct DirectV4LaunchParams {
        string name;
        string symbol;
        string metadataURI;
        uint256 hookRegistryEntryId;
        address hooks;
        uint160 sqrtPriceX96;
        uint24 poolFee;
        int24 tickSpacing;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 tokenAmount;
        uint256 nativeAmount;
        address lpRecipient;
        bytes hookData;
    }

    struct DirectV4Launch {
        address token;
        address creator;
        uint256 hookRegistryEntryId;
        address hooks;
        bytes32 poolId;
        uint256 positionId;
        uint128 liquidity;
        address lpRecipient;
        string metadataURI;
    }

    IEulrHookRegistry public immutable hookRegistry;
    IPoolManager public immutable poolManager;
    IDirectV4InitialLiquidityTarget public immutable liquidityTarget;
    uint256 public nextDirectV4LaunchId;

    mapping(uint256 launchId => DirectV4Launch launch) private _directV4Launches;

    error ZeroAddress();
    error DependencyHasNoCode(address target);
    error UnapprovedHook();
    error InvalidPoolConfig();
    error InvalidFeePayment();
    error InvalidLiquidityResult();

    event DirectV4LaunchCreated(
        uint256 indexed launchId,
        address indexed token,
        address indexed creator,
        uint256 hookRegistryEntryId,
        address hook,
        bytes32 poolId,
        uint256 positionId,
        uint128 liquidity,
        address lpRecipient
    );

    constructor(address hookRegistry_, address poolManager_, address liquidityTarget_) {
        if (hookRegistry_ == address(0) || poolManager_ == address(0) || liquidityTarget_ == address(0)) {
            revert ZeroAddress();
        }
        if (hookRegistry_.code.length == 0 || poolManager_.code.length == 0 || liquidityTarget_.code.length == 0) {
            revert DependencyHasNoCode(address(0));
        }

        hookRegistry = IEulrHookRegistry(hookRegistry_);
        poolManager = IPoolManager(poolManager_);
        liquidityTarget = IDirectV4InitialLiquidityTarget(liquidityTarget_);
    }

    function createDirectV4Launch(DirectV4LaunchParams calldata params)
        external
        payable
        returns (uint256 launchId, address token)
    {
        IEulrHookRegistry.HookEntry memory entry = hookRegistry.getHookEntry(params.hookRegistryEntryId);
        _validateParams(params, entry);

        uint256 nativeTemplateFee = _payTemplateFeeIfNeeded(entry, params.hookRegistryEntryId, msg.sender, msg.value);
        if (msg.value - nativeTemplateFee != params.nativeAmount) {
            revert InvalidFeePayment();
        }

        EulrToken tokenContract = new EulrToken(params.name, params.symbol, address(this));
        token = address(tokenContract);
        tokenContract.setHook(address(this));
        tokenContract.mint(address(this), params.tokenAmount);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: params.poolFee,
            tickSpacing: params.tickSpacing,
            hooks: IHooks(params.hooks)
        });
        int24 initialTick = poolManager.initialize(key, params.sqrtPriceX96);
        initialTick;

        IERC20(token).forceApprove(address(liquidityTarget), params.tokenAmount);
        (uint256 positionId, uint128 liquidityAdded) = liquidityTarget.addInitialLiquidity{value: params.nativeAmount}(
            key,
            token,
            params.tokenAmount,
            params.tickLower,
            params.tickUpper,
            params.liquidity,
            params.lpRecipient,
            params.hookData
        );
        IERC20(token).forceApprove(address(liquidityTarget), 0);
        if (positionId == 0 || liquidityAdded == 0 || IERC20(token).balanceOf(address(this)) != 0) {
            revert InvalidLiquidityResult();
        }

        bytes32 poolId = _poolId(key);
        launchId = nextDirectV4LaunchId + 1;
        nextDirectV4LaunchId = launchId;
        _directV4Launches[launchId] = DirectV4Launch({
            token: token,
            creator: msg.sender,
            hookRegistryEntryId: params.hookRegistryEntryId,
            hooks: params.hooks,
            poolId: poolId,
            positionId: positionId,
            liquidity: liquidityAdded,
            lpRecipient: params.lpRecipient,
            metadataURI: params.metadataURI
        });

        emit DirectV4LaunchCreated(
            launchId,
            token,
            msg.sender,
            params.hookRegistryEntryId,
            params.hooks,
            poolId,
            positionId,
            liquidityAdded,
            params.lpRecipient
        );
    }

    function getDirectV4Launch(uint256 launchId) external view returns (DirectV4Launch memory launch) {
        launch = _directV4Launches[launchId];
        if (launch.token == address(0)) {
            revert InvalidPoolConfig();
        }
    }

    function _validateParams(DirectV4LaunchParams calldata params, IEulrHookRegistry.HookEntry memory entry)
        internal
        view
    {
        if (params.hooks == address(0) || params.lpRecipient == address(0)) {
            revert ZeroAddress();
        }
        if (
            !hookRegistry.isApprovedForDirectV4(params.hookRegistryEntryId) || entry.hook != params.hooks
                || entry.targetChainId != block.chainid
        ) {
            revert UnapprovedHook();
        }
        if (
            params.poolFee == 0 || params.tickSpacing <= 0 || params.tickLower >= params.tickUpper
                || params.tickLower % params.tickSpacing != 0 || params.tickUpper % params.tickSpacing != 0
                || params.liquidity == 0 || params.tokenAmount == 0
        ) {
            revert InvalidPoolConfig();
        }
        if (entry.recommendedPoolFee != 0 && entry.recommendedPoolFee != params.poolFee) {
            revert InvalidPoolConfig();
        }
        if (entry.recommendedTickSpacing != 0 && entry.recommendedTickSpacing != params.tickSpacing) {
            revert InvalidPoolConfig();
        }
    }

    function _payTemplateFeeIfNeeded(
        IEulrHookRegistry.HookEntry memory entry,
        uint256 entryId,
        address payer,
        uint256 nativeValue
    ) internal returns (uint256 nativeTemplateFee) {
        IEulrHookRegistry.TemplateFeeConfig memory feeConfig = entry.feeConfig;
        if (feeConfig.oneTimeFee == 0) {
            return 0;
        }

        if (feeConfig.feeCurrency == address(0)) {
            nativeTemplateFee = feeConfig.oneTimeFee;
            if (nativeValue < nativeTemplateFee) {
                revert InvalidFeePayment();
            }
            // slither-disable-next-line arbitrary-send-eth
            (uint256 nativeGrossAmount, uint256 nativeProtocolAmount, uint256 nativeCreatorAmount) =
                hookRegistry.payTemplateFee{value: nativeTemplateFee}(entryId, payer);
            nativeGrossAmount;
            nativeProtocolAmount;
            nativeCreatorAmount;
            return nativeTemplateFee;
        }

        (uint256 tokenGrossAmount, uint256 tokenProtocolAmount, uint256 tokenCreatorAmount) =
            hookRegistry.payTemplateFee(entryId, payer);
        tokenGrossAmount;
        tokenProtocolAmount;
        tokenCreatorAmount;
        return 0;
    }

    function _poolId(PoolKey memory key) internal pure returns (bytes32 poolId) {
        assembly ("memory-safe") {
            poolId := keccak256(key, 0xa0)
        }
    }
}
