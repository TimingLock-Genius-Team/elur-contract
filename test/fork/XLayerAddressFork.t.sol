// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BuyQuote, SellQuote} from "../../src/curve/CurveTypes.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {BaseUniswapV4MigrationTarget} from "../../src/migration/BaseUniswapV4MigrationTarget.sol";
import {MigrationData} from "../../src/migration/MigrationData.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";

interface IPositionManagerRead {
    function nextTokenId() external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IUniswapV4MigrationTargetRead {
    function poolManager() external view returns (address);
    function positionManager() external view returns (address);
    function lpRecipient() external view returns (address);
}

contract XLayerAddressForkTest is Test {
    error MissingCode(address target);

    function test_XLayerExternalAddressesHaveCode() public view {
        if (!_isExpectedForkChain()) {
            return;
        }

        _requireCode(vm.envAddress("UNISWAP_V4_POOL_MANAGER"));
        _requireCode(vm.envAddress("UNISWAP_V4_POSITION_MANAGER"));
        _requireCode(vm.envAddress("MIGRATION_TARGET"));
    }

    function test_FactoryDeploysWithVerifiedProductionAddresses() public {
        if (!_isExpectedForkChain()) {
            return;
        }

        address feeRecipient = vm.envAddress("TEAM_MULTISIG");
        address migrationTarget = vm.envAddress("MIGRATION_TARGET");

        EulrFactory factory = new EulrFactory(feeRecipient, migrationTarget);

        assertEq(factory.feeRecipient(), feeRecipient);
        assertEq(factory.migrationTarget(), migrationTarget);
    }

    function test_CreateTokenAndSmallBuySellOnXLayerFork() public {
        if (!_isExpectedForkChain()) {
            return;
        }

        (EulrToken token, EulrHook hook, EulrRouter router) = _createForkToken();
        _assertSmallBuySell(token, hook, router);
    }

    function _assertSmallBuySell(EulrToken token, EulrHook hook, EulrRouter router) internal {
        address trader = makeAddr("xlayer-fork-trader");

        BuyQuote memory buyQuote = hook.quoteBuy(1e18);
        vm.deal(trader, 1e18);

        vm.prank(trader);
        uint256 tokensOut = router.buy{value: 1e18}(address(token), buyQuote.tokensOut, trader);

        assertEq(tokensOut, buyQuote.tokensOut);
        assertEq(token.balanceOf(trader), tokensOut);
        assertEq(hook.okbCum(), buyQuote.newOkbCum);

        vm.roll(block.number + 1);
        uint256 tokensIn = tokensOut / 2;
        SellQuote memory sellQuote = hook.quoteSell(tokensIn);

        vm.startPrank(trader);
        token.approve(address(router), tokensIn);
        uint256 okbOut = router.sell(address(token), tokensIn, sellQuote.netOkbOut, trader);
        vm.stopPrank();

        assertEq(okbOut, sellQuote.netOkbOut);
        assertEq(hook.okbCum(), sellQuote.newOkbCum);
    }

    function test_MigrationPathMintsRealV4PositionToConfiguredRecipient() public {
        if (!_isExpectedForkChain()) {
            return;
        }

        address lpRecipient = vm.envAddress("LP_RECIPIENT");
        address teamMultisig = vm.envAddress("TEAM_MULTISIG");
        address migrationTarget = vm.envAddress("MIGRATION_TARGET");
        address positionManager = vm.envAddress("UNISWAP_V4_POSITION_MANAGER");

        assertNotEq(lpRecipient, teamMultisig, "LP recipient must not be team multisig");
        assertNotEq(lpRecipient, address(this), "LP recipient must not be fork deployer");
        _requireCode(migrationTarget);
        _requireCode(positionManager);
        _requireLpRecipientCodeIfLock(lpRecipient);
        _assertMigrationTargetConfig(migrationTarget, positionManager, lpRecipient);

        (EulrToken token, EulrHook hook, EulrRouter router) = _createForkToken();
        _graduateToken(token, hook, router);

        uint256 expectedPositionId =
            _migrateAndAssertCustody(token, hook, migrationTarget, positionManager, lpRecipient);
        _assertPositionOwner(positionManager, expectedPositionId, lpRecipient, teamMultisig);
    }

    function _isExpectedForkChain() internal view returns (bool) {
        return block.chainid == vm.envOr("XLAYER_CHAIN_ID", uint256(196));
    }

    function _deployFactoryWithProductionAddresses() internal returns (EulrFactory factory) {
        factory = new EulrFactory(vm.envAddress("TEAM_MULTISIG"), vm.envAddress("MIGRATION_TARGET"));
    }

    function _assertMigrationTargetConfig(address migrationTarget, address positionManager, address lpRecipient)
        internal
        view
    {
        assertEq(IUniswapV4MigrationTargetRead(migrationTarget).poolManager(), vm.envAddress("UNISWAP_V4_POOL_MANAGER"));
        assertEq(IUniswapV4MigrationTargetRead(migrationTarget).positionManager(), positionManager);
        assertEq(IUniswapV4MigrationTargetRead(migrationTarget).lpRecipient(), lpRecipient);
    }

    function _migrateAndAssertCustody(
        EulrToken token,
        EulrHook hook,
        address migrationTarget,
        address positionManager,
        address lpRecipient
    ) internal returns (uint256 expectedPositionId) {
        uint256 claimableFees = hook.claimableFeeOkb();
        uint256 okbAmount = address(hook).balance - claimableFees;
        uint256 tokenAmount = 21_000_000e18 - token.totalSupply();
        bytes memory migrationData = _migrationData(address(token), okbAmount, tokenAmount, lpRecipient);
        expectedPositionId = IPositionManagerRead(positionManager).nextTokenId();

        vm.expectEmit(true, true, true, false, migrationTarget);
        emit BaseUniswapV4MigrationTarget.LpCustodyProven(
            address(token), vm.envAddress("UNISWAP_V4_POOL_MANAGER"), expectedPositionId, 0, lpRecipient
        );

        (, uint256 liquidity) = hook.migrateLiquidity(migrationData);

        assertGt(liquidity, 0, "migration liquidity");
        assertTrue(hook.liquidityMigrated(), "migration flag");
    }

    function _createForkToken() internal returns (EulrToken token, EulrHook hook, EulrRouter router) {
        EulrFactory factory = _deployFactoryWithProductionAddresses();
        (address tokenAddress, address hookAddress, address routerAddress) = factory.createToken(
            "Fork Migration", "FMIG", "ipfs://fork-migration", "https://eulr.example/fork-migration"
        );

        token = EulrToken(tokenAddress);
        hook = EulrHook(payable(hookAddress));
        router = EulrRouter(payable(routerAddress));
    }

    function _graduateToken(EulrToken token, EulrHook hook, EulrRouter router) internal {
        address trader = makeAddr("xlayer-fork-migration-trader");

        for (uint256 i = 0; i < 47; i++) {
            vm.roll(block.number + 1);
            vm.deal(trader, 10e18);
            BuyQuote memory quote = hook.quoteBuy(10e18);

            vm.prank(trader);
            router.buy{value: 10e18}(address(token), quote.tokensOut, trader);
        }

        assertTrue(hook.selfDeprecated(), "graduated");
    }

    function _migrationData(address token, uint256 okbAmount, uint256 tokenAmount, address lpRecipient)
        internal
        view
        returns (bytes memory)
    {
        MigrationData.Params memory params = MigrationData.Params({
            currency0: address(0),
            currency1: token,
            hooks: vm.envOr("XLAYER_V4_HOOKS", address(0)),
            poolFee: uint24(vm.envOr("XLAYER_V4_POOL_FEE", uint256(3000))),
            tickSpacing: int24(vm.envOr("XLAYER_V4_TICK_SPACING", int256(60))),
            tickLower: int24(vm.envOr("XLAYER_V4_TICK_LOWER", int256(-887_220))),
            tickUpper: int24(vm.envOr("XLAYER_V4_TICK_UPPER", int256(887_220))),
            liquidity: uint128(vm.envOr("XLAYER_V4_MIGRATION_LIQUIDITY", uint256(1e18))),
            amount0Max: okbAmount,
            amount1Max: tokenAmount,
            deadline: block.timestamp + 1 hours,
            lpRecipient: lpRecipient,
            hookData: vm.envOr("XLAYER_V4_HOOK_DATA", bytes(""))
        });

        return abi.encode(params);
    }

    function _requireLpRecipientCodeIfLock(address lpRecipient) internal view {
        if (lpRecipient != MigrationData.BURN_ADDRESS) {
            _requireCode(lpRecipient);
        }
    }

    function _assertPositionOwner(
        address positionManager,
        uint256 positionId,
        address expectedRecipient,
        address teamMultisig
    ) internal view {
        (bool ok, bytes memory data) = positionManager.staticcall(
            abi.encodeCall(IPositionManagerRead.ownerOf, (positionId))
        );
        assertTrue(ok, "PositionManager ownerOf unavailable");
        assertEq(data.length, 32, "PositionManager ownerOf invalid response");

        address owner = abi.decode(data, (address));
        assertEq(owner, expectedRecipient, "position owner");
        assertNotEq(owner, address(this), "position owned by fork deployer");
        assertNotEq(owner, teamMultisig, "position owned by team multisig");
    }

    function _requireCode(address target) internal view {
        if (target.code.length == 0) {
            revert MissingCode(target);
        }
    }
}
