// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {IEulrFactory} from "../../src/interfaces/IEulrFactory.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract FactoryCreateTokenTest is EulrTestBase {
    event TokenCreated(
        address indexed token,
        address indexed hook,
        address router,
        address indexed creator,
        string metadataURI,
        string socialURI,
        uint16 curveS
    );

    function test_AnyEoaCanCreateTokenAndEventIsIndexable() public {
        address alice = makeAddr("alice");

        vm.prank(alice);
        (address token, address hook, address router) =
            factory.createToken("Alpha", "ALPHA", "ipfs://alpha", "https://alpha.example");

        IEulrFactory.TokenInfo memory info = factory.getTokenInfo(token);
        assertEq(info.creator, alice);
        assertEq(info.token, token);
        assertEq(info.hook, hook);
        assertEq(info.router, router);
        assertEq(info.metadataURI, "ipfs://alpha");
        assertEq(info.socialURI, "https://alpha.example");
    }

    function test_AllTokensLengthAndRegistryIncreaseForEachCreate() public {
        (EulrToken tokenA, EulrHook hookA, EulrRouter routerA) = createToken("Alpha", "ALPHA", creator);
        (EulrToken tokenB, EulrHook hookB, EulrRouter routerB) = createToken("Beta", "BETA", makeAddr("bob"));

        assertEq(factory.allTokensLength(), 2);
        assertTrue(factory.isToken(address(tokenA)));
        assertTrue(factory.isToken(address(tokenB)));
        assertTrue(address(hookA) != address(hookB));
        assertTrue(address(routerA) != address(routerB));
    }

    function test_RevertWhen_GetTokenInfoForUnknownToken() public {
        vm.expectRevert(EulrFactory.UnknownToken.selector);
        factory.getTokenInfo(makeAddr("unknown-token"));
    }

    function test_ConstructorRejectsZeroAddresses() public {
        EulrFactory zeroFeeRecipientImplementation = new EulrFactory();
        vm.expectRevert(EulrFactory.ZeroAddress.selector);
        new TransparentUpgradeableProxy(
            address(zeroFeeRecipientImplementation),
            address(this),
            abi.encodeCall(
                EulrFactory.initialize,
                (address(0), address(migrationTarget), address(routerImplementation), address(this), address(this))
            )
        );

        EulrFactory zeroMigrationTargetImplementation = new EulrFactory();
        vm.expectRevert(EulrFactory.ZeroAddress.selector);
        new TransparentUpgradeableProxy(
            address(zeroMigrationTargetImplementation),
            address(this),
            abi.encodeCall(
                EulrFactory.initialize,
                (feeRecipient, address(0), address(routerImplementation), address(this), address(this))
            )
        );
    }
}
