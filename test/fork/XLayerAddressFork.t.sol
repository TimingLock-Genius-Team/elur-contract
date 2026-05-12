// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BuyQuote, SellQuote} from "../../src/curve/CurveTypes.sol";
import {SatpadFactory} from "../../src/factory/SatpadFactory.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

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

        SatpadFactory factory = new SatpadFactory(feeRecipient, migrationTarget);

        assertEq(factory.feeRecipient(), feeRecipient);
        assertEq(factory.migrationTarget(), migrationTarget);
    }

    function test_CreateTokenAndSmallBuySellOnXLayerFork() public {
        if (!_isExpectedForkChain()) {
            return;
        }

        address trader = makeAddr("xlayer-fork-trader");
        SatpadFactory factory = _deployFactoryWithProductionAddresses();

        (address tokenAddress, address hookAddress, address routerAddress) =
            factory.createToken("Fork Demo", "FORK", "ipfs://fork-demo", "https://satpad.example/fork");

        assertTrue(factory.isToken(tokenAddress));

        SatpadToken token = SatpadToken(tokenAddress);
        SatpadHook hook = SatpadHook(payable(hookAddress));
        SatpadRouter router = SatpadRouter(payable(routerAddress));

        BuyQuote memory buyQuote = hook.quoteBuy(1e18);
        vm.deal(trader, 1e18);

        vm.prank(trader);
        uint256 tokensOut = router.buy{value: 1e18}(tokenAddress, buyQuote.tokensOut, trader);

        assertEq(tokensOut, buyQuote.tokensOut);
        assertEq(token.balanceOf(trader), tokensOut);
        assertEq(hook.okbCum(), buyQuote.newOkbCum);

        vm.roll(block.number + 1);
        uint256 tokensIn = tokensOut / 2;
        SellQuote memory sellQuote = hook.quoteSell(tokensIn);

        vm.startPrank(trader);
        token.approve(routerAddress, tokensIn);
        uint256 okbOut = router.sell(tokenAddress, tokensIn, sellQuote.netOkbOut, trader);
        vm.stopPrank();

        assertEq(okbOut, sellQuote.netOkbOut);
        assertEq(hook.okbCum(), sellQuote.newOkbCum);
    }

    function _isExpectedForkChain() internal view returns (bool) {
        return block.chainid == vm.envOr("XLAYER_CHAIN_ID", uint256(196));
    }

    function _deployFactoryWithProductionAddresses() internal returns (SatpadFactory factory) {
        factory = new SatpadFactory(vm.envAddress("TEAM_MULTISIG"), vm.envAddress("MIGRATION_TARGET"));
    }

    function _requireCode(address target) internal view {
        if (target.code.length == 0) {
            revert MissingCode(target);
        }
    }
}
