// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {EulrV4SellTaxHook} from "../../src/v4/EulrV4SellTaxHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

contract EulrV4SellTaxHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;

    uint160 internal constant SELL_TAX_HOOK_FLAGS = Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG;
    address internal constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    EulrV4SellTaxHook internal sellTaxHook;
    MockERC20 internal eulr;
    Currency internal eulrCurrency;
    PoolKey internal sellTaxKey;
    address internal hookAddress;

    function setUp() public {
        deployFreshManagerAndRouters();
        vm.deal(address(this), 500 ether);

        eulr = new MockERC20("Eulr", "EULR", 18);
        eulr.mint(address(this), 1_000_000e18);
        eulr.approve(address(swapRouter), type(uint256).max);
        eulr.approve(address(modifyLiquidityRouter), type(uint256).max);
        eulrCurrency = Currency.wrap(address(eulr));

        hookAddress = address(SELL_TAX_HOOK_FLAGS);
        deployCodeTo(
            "EulrV4SellTaxHook.sol:EulrV4SellTaxHook",
            abi.encode(IPoolManager(manager), address(this), uint16(100), uint16(1_000), int24(-100), int24(100)),
            hookAddress
        );
        sellTaxHook = EulrV4SellTaxHook(hookAddress);
        sellTaxHook.setAuthorizedToken(address(eulr), true);

        (sellTaxKey,) = initPool(
            CurrencyLibrary.ADDRESS_ZERO, eulrCurrency, IHooks(hookAddress), 0, 60, TickMath.getSqrtPriceAtTick(0)
        );
        modifyLiquidityRouter.modifyLiquidity{value: 100 ether}(sellTaxKey, LIQUIDITY_PARAMS, ZERO_BYTES);
    }

    function test_ExactInputSellTaxesEulrAndPoolReceivesNetInput() public {
        uint256 grossAmountIn = 1e12;
        uint256 expectedTax = (grossAmountIn * 550) / 10_000;
        uint256 managerEulrBefore = eulr.balanceOf(address(manager));
        uint256 traderEulrBefore = eulr.balanceOf(address(this));

        vm.expectEmit(true, true, true, true, hookAddress);
        emit EulrV4SellTaxHook.SellTaxApplied(
            sellTaxKey.toId(),
            address(eulr),
            address(swapRouter),
            550,
            grossAmountIn,
            expectedTax,
            grossAmountIn - expectedTax
        );

        swap(
            sellTaxKey,
            false,
            // casting is safe: grossAmountIn is a small test fixture.
            // forge-lint: disable-next-line(unsafe-typecast)
            -int256(grossAmountIn),
            ZERO_BYTES
        );

        assertEq(eulr.balanceOf(BURN_ADDRESS), expectedTax, "dead receives tax");
        assertEq(eulr.balanceOf(address(manager)) - managerEulrBefore, grossAmountIn - expectedTax, "pool receives net");
        assertEq(traderEulrBefore - eulr.balanceOf(address(this)), grossAmountIn, "trader pays gross");
    }

    function test_BuyEulrWithNativeOkbIsNotTaxed() public {
        uint256 burnBefore = eulr.balanceOf(BURN_ADDRESS);

        swap(sellTaxKey, true, -int256(1e12), ZERO_BYTES);

        assertEq(eulr.balanceOf(BURN_ADDRESS), burnBefore, "buy does not tax");
    }

    function test_RevertWhen_ExactOutputSellIsAttempted() public {
        _expectWrappedBeforeSwapRevert(EulrV4SellTaxHook.ExactOutputSellUnsupported.selector);
        swap(sellTaxKey, false, int256(1e12), ZERO_BYTES);
    }

    function test_RevertWhen_SellUsesUnsupportedEulrPool() public {
        MockERC20 unsupported = new MockERC20("Unsupported", "NOPE", 18);
        unsupported.mint(address(this), 1_000_000e18);
        unsupported.approve(address(swapRouter), type(uint256).max);
        unsupported.approve(address(modifyLiquidityRouter), type(uint256).max);
        Currency unsupportedCurrency = Currency.wrap(address(unsupported));
        (PoolKey memory unsupportedKey,) = initPool(
            CurrencyLibrary.ADDRESS_ZERO,
            unsupportedCurrency,
            IHooks(hookAddress),
            0,
            60,
            TickMath.getSqrtPriceAtTick(0)
        );
        modifyLiquidityRouter.modifyLiquidity{value: 100 ether}(unsupportedKey, LIQUIDITY_PARAMS, ZERO_BYTES);

        _expectWrappedBeforeSwapRevert(EulrV4SellTaxHook.UnauthorizedPool.selector);
        swap(unsupportedKey, false, -int256(1e12), ZERO_BYTES);
    }

    function test_TaxBpsClampsAndInterpolatesByTick() public view {
        assertEq(sellTaxHook.taxBpsForTick(-101), 1_000, "below low tick clamps to max");
        assertEq(sellTaxHook.taxBpsForTick(-100), 1_000, "low tick uses max");
        assertEq(sellTaxHook.taxBpsForTick(0), 550, "mid tick interpolates");
        assertEq(sellTaxHook.taxBpsForTick(100), 100, "high tick uses min");
        assertEq(sellTaxHook.taxBpsForTick(101), 100, "above high tick clamps to min");
    }

    function _expectWrappedBeforeSwapRevert(bytes4 reasonSelector) internal {
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                hookAddress,
                IHooks.beforeSwap.selector,
                abi.encodeWithSelector(reasonSelector),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
    }
}
