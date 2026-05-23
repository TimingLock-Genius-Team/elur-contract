// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

contract EulrV4SellTaxHook is IHooks {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using CurrencyLibrary for Currency;
    using SafeCast for uint256;

    uint16 internal constant BPS_DENOMINATOR = 10_000;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    IPoolManager public immutable poolManager;
    address public immutable owner;
    uint16 public immutable minTaxBps;
    uint16 public immutable maxTaxBps;
    int24 public immutable taxLowTick;
    int24 public immutable taxHighTick;

    mapping(address token => bool authorized) public authorizedToken;

    event AuthorizedTokenUpdated(address indexed token, bool authorized);
    event SellTaxApplied(
        PoolId indexed poolId,
        address indexed token,
        address indexed sender,
        uint16 taxBps,
        uint256 grossAmountIn,
        uint256 taxAmount,
        uint256 netAmountIn
    );

    error OnlyPoolManager();
    error OnlyOwner();
    error InvalidTaxConfig();
    error ZeroAddress();
    error UnauthorizedPool();
    error ExactOutputSellUnsupported();
    error TaxAmountTooLarge();

    constructor(
        IPoolManager poolManager_,
        address owner_,
        uint16 minTaxBps_,
        uint16 maxTaxBps_,
        int24 taxLowTick_,
        int24 taxHighTick_
    ) {
        if (address(poolManager_) == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (maxTaxBps_ > BPS_DENOMINATOR || minTaxBps_ > maxTaxBps_ || taxLowTick_ >= taxHighTick_) {
            revert InvalidTaxConfig();
        }

        poolManager = poolManager_;
        owner = owner_;
        minTaxBps = minTaxBps_;
        maxTaxBps = maxTaxBps_;
        taxLowTick = taxLowTick_;
        taxHighTick = taxHighTick_;

        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    function setAuthorizedToken(address token, bool authorized) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        authorizedToken[token] = authorized;
        emit AuthorizedTokenUpdated(token, authorized);
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory permissions) {
        permissions = Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function taxBpsForTick(int24 currentTick) public view returns (uint16) {
        if (currentTick <= taxLowTick) return maxTaxBps;
        if (currentTick >= taxHighTick) return minTaxBps;

        // casting is safe: bounds above guarantee both differences are non-negative and fit uint256.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 tickProgress = uint256(int256(currentTick) - int256(taxLowTick));
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 tickRange = uint256(int256(taxHighTick) - int256(taxLowTick));
        uint256 taxRange = uint256(maxTaxBps - minTaxBps);
        uint256 taxDrop = (tickProgress * taxRange) / tickRange;

        // casting is safe: maxTaxBps is bounded to BPS_DENOMINATOR.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint16(uint256(maxTaxBps) - taxDrop);
    }

    function beforeSwap(address sender, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        _validatePool(key);

        if (params.zeroForOne) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }
        if (params.amountSpecified > 0) revert ExactOutputSellUnsupported();
        if (params.amountSpecified == 0) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint256 grossAmountIn = uint256(-params.amountSpecified);
        (, int24 currentTick,,) = poolManager.getSlot0(key.toId());
        uint16 taxBps = taxBpsForTick(currentTick);
        uint256 taxAmount = (grossAmountIn * taxBps) / BPS_DENOMINATOR;
        if (taxAmount == 0) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }
        if (taxAmount > uint256(uint128(type(int128).max))) revert TaxAmountTooLarge();

        poolManager.take(key.currency1, BURN_ADDRESS, taxAmount);

        uint256 netAmountIn = grossAmountIn - taxAmount;
        emit SellTaxApplied(
            key.toId(), Currency.unwrap(key.currency1), sender, taxBps, grossAmountIn, taxAmount, netAmountIn
        );

        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(taxAmount.toInt128(), 0), 0);
    }

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        return IHooks.afterInitialize.selector;
    }

    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IHooks.beforeAddLiquidity.selector;
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        return (IHooks.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return IHooks.beforeRemoveLiquidity.selector;
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        return (IHooks.afterRemoveLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    function afterSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, int128)
    {
        return (IHooks.afterSwap.selector, 0);
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IHooks.beforeDonate.selector;
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IHooks.afterDonate.selector;
    }

    function _validatePool(PoolKey calldata key) internal view {
        if (
            !key.currency0.isAddressZero() || address(key.hooks) != address(this)
                || !authorizedToken[Currency.unwrap(key.currency1)]
        ) {
            revert UnauthorizedPool();
        }
    }
}
