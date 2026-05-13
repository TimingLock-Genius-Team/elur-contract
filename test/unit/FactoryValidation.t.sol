// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {CurveParams} from "../../src/curve/CurveTypes.sol";
import {IEulrFactory} from "../../src/interfaces/IEulrFactory.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";

contract FactoryValidationTest is EulrTestBase {
    function test_RevertWhen_ExternalDependencyHasNoCode() public {
        vm.expectRevert(abi.encodeWithSelector(EulrFactory.MissingExternalCode.selector, address(0x5678)));
        new EulrFactory(feeRecipient, address(0x5678));
    }

    function test_RevertWhen_NameOrSymbolInvalid() public {
        vm.expectRevert(EulrFactory.EmptyName.selector);
        factory.createToken("", "DEMO", "ipfs://demo", "");

        vm.expectRevert(EulrFactory.EmptySymbol.selector);
        factory.createToken("Demo", "", "ipfs://demo", "");

        vm.expectRevert(EulrFactory.SymbolTooLong.selector);
        factory.createToken("Demo", "TOO-LONG!", "ipfs://demo", "");
    }

    function test_RevertWhen_MetadataOrSocialUriTooLong() public {
        vm.expectRevert(EulrFactory.MetadataURITooLong.selector);
        factory.createToken("Demo", "DEMO", _stringOfLength(513), "");

        vm.expectRevert(EulrFactory.SocialURITooLong.selector);
        factory.createToken("Demo", "DEMO", "ipfs://demo", _stringOfLength(257));
    }

    function test_CreateTokenDeploysIsolatedTokenHookRouterAndRegistry() public {
        vm.prank(creator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            factory.createToken("Demo", "DEMO", "ipfs://demo", "https://demo.example");

        EulrToken token = EulrToken(tokenAddr);
        EulrHook hook = EulrHook(payable(hookAddr));
        EulrRouter router = EulrRouter(payable(routerAddr));

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

        IEulrFactory.TokenInfo memory info = factory.getTokenInfo(tokenAddr);
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

    function test_GetTokensReturnsPaginatedCreatedTokenAddresses() public {
        (EulrToken tokenA,,) = createToken("Alpha", "ALPHA", creator);
        (EulrToken tokenB,,) = createToken("Beta", "BETA", trader);
        (EulrToken tokenC,,) = createToken("Gamma", "GAMMA", recipient);

        address[] memory firstPage = factory.getTokens(0, 2);
        assertEq(firstPage.length, 2);
        assertEq(firstPage[0], address(tokenA));
        assertEq(firstPage[1], address(tokenB));

        address[] memory secondPage = factory.getTokens(2, 2);
        assertEq(secondPage.length, 1);
        assertEq(secondPage[0], address(tokenC));

        address[] memory emptyPage = factory.getTokens(3, 2);
        assertEq(emptyPage.length, 0);
    }

    function _stringOfLength(uint256 length) internal pure returns (string memory) {
        bytes memory data = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            data[i] = "a";
        }
        return string(data);
    }
}
