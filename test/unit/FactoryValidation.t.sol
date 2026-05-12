// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {CurveParams} from "../../src/curve/CurveTypes.sol";
import {ISatpadFactory} from "../../src/interfaces/ISatpadFactory.sol";
import {SatpadFactory} from "../../src/factory/SatpadFactory.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract FactoryValidationTest is SatpadTestBase {
    function test_RevertWhen_ExternalDependencyHasNoCode() public {
        vm.expectRevert(abi.encodeWithSelector(SatpadFactory.MissingExternalCode.selector, address(0x5678)));
        new SatpadFactory(feeRecipient, address(0x5678));
    }

    function test_RevertWhen_NameOrSymbolInvalid() public {
        vm.expectRevert(SatpadFactory.EmptyName.selector);
        factory.createToken("", "DEMO", "ipfs://demo", "");

        vm.expectRevert(SatpadFactory.EmptySymbol.selector);
        factory.createToken("Demo", "", "ipfs://demo", "");

        vm.expectRevert(SatpadFactory.SymbolTooLong.selector);
        factory.createToken("Demo", "TOO-LONG!", "ipfs://demo", "");
    }

    function test_CreateTokenDeploysIsolatedTokenHookRouterAndRegistry() public {
        vm.prank(creator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            factory.createToken("Demo", "DEMO", "ipfs://demo", "https://demo.example");

        SatpadToken token = SatpadToken(tokenAddr);
        SatpadHook hook = SatpadHook(payable(hookAddr));
        SatpadRouter router = SatpadRouter(payable(routerAddr));

        assertGt(tokenAddr.code.length, 0);
        assertGt(hookAddr.code.length, 0);
        assertGt(routerAddr.code.length, 0);
        assertEq(token.hook(), hookAddr);
        assertEq(address(router.token()), tokenAddr);
        assertEq(address(router.hook()), hookAddr);
        assertEq(hook.router(), routerAddr);
        assertEq(hook.migrationTarget(), address(migrationTarget));
        assertEq(factory.migrationTarget(), address(migrationTarget));
        assertEq(factory.allTokensLength(), 1);
        assertTrue(factory.isToken(tokenAddr));

        ISatpadFactory.TokenInfo memory info = factory.getTokenInfo(tokenAddr);
        assertEq(info.creator, creator);
        assertEq(info.metadataURI, "ipfs://demo");
        assertEq(info.socialURI, "https://demo.example");

        CurveParams memory params = hook.getCurveParams();
        assertEq(params.k, 21_000_000e18);
        assertEq(params.s, 100e18);
        assertEq(params.feeBps, 30);
        assertEq(params.selfDeprecationBps, 9900);
        assertEq(params.maxBuyOkb, 10e18);
    }
}
