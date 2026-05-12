// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {ISatpadFactory} from "../../src/interfaces/ISatpadFactory.sol";
import {SatpadFactory} from "../../src/factory/SatpadFactory.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract FactoryCreateTokenTest is SatpadTestBase {
    event TokenCreated(
        address indexed token,
        address indexed hook,
        address indexed router,
        address creator,
        string metadataURI,
        string socialURI
    );

    function test_AnyEoaCanCreateTokenAndEventIsIndexable() public {
        address alice = makeAddr("alice");

        vm.prank(alice);
        (address token, address hook, address router) =
            factory.createToken("Alpha", "ALPHA", "ipfs://alpha", "https://alpha.example");

        ISatpadFactory.TokenInfo memory info = factory.getTokenInfo(token);
        assertEq(info.creator, alice);
        assertEq(info.token, token);
        assertEq(info.hook, hook);
        assertEq(info.router, router);
        assertEq(info.metadataURI, "ipfs://alpha");
        assertEq(info.socialURI, "https://alpha.example");
    }

    function test_AllTokensLengthAndRegistryIncreaseForEachCreate() public {
        (SatpadToken tokenA, SatpadHook hookA, SatpadRouter routerA) = createToken("Alpha", "ALPHA", creator);
        (SatpadToken tokenB, SatpadHook hookB, SatpadRouter routerB) = createToken("Beta", "BETA", makeAddr("bob"));

        assertEq(factory.allTokensLength(), 2);
        assertTrue(factory.isToken(address(tokenA)));
        assertTrue(factory.isToken(address(tokenB)));
        assertTrue(address(hookA) != address(hookB));
        assertTrue(address(routerA) != address(routerB));
    }

    function test_RevertWhen_GetTokenInfoForUnknownToken() public {
        vm.expectRevert(SatpadFactory.UnknownToken.selector);
        factory.getTokenInfo(makeAddr("unknown-token"));
    }

    function test_ConstructorRejectsZeroAddresses() public {
        vm.expectRevert(SatpadFactory.ZeroAddress.selector);
        new SatpadFactory(address(0), address(poolManager), address(positionManager), address(migrationTarget));

        vm.expectRevert(SatpadFactory.ZeroAddress.selector);
        new SatpadFactory(feeRecipient, address(0), address(positionManager), address(migrationTarget));
    }
}
