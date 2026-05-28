// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {IEulrFactory} from "../../src/interfaces/IEulrFactory.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {MockMigrationTarget} from "../mocks/MockMigrationTarget.sol";
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
    event TokenV4MigrationProfileBound(
        address indexed token, uint256 indexed profileId, address indexed hooks, address migrationTarget
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

    function test_CreateTokenWithV4MigrationProfileBindsFutureHookMigrationTarget() public {
        MockMigrationTarget profileTarget = new MockMigrationTarget();
        address v4Hook = address(0xC0c8);
        IEulrFactory.V4MigrationProfile memory profile = IEulrFactory.V4MigrationProfile({
            hookRegistryEntryId: 0,
            migrationTarget: address(profileTarget),
            hooks: v4Hook,
            poolFee: 3_000,
            tickSpacing: 60,
            tickLower: -120,
            tickUpper: 120,
            hookDataHash: keccak256("hook-data"),
            active: true
        });
        uint256 profileId = factory.registerV4MigrationProfile(profile);

        vm.expectEmit(false, true, true, true);
        emit TokenV4MigrationProfileBound(address(0), profileId, v4Hook, address(profileTarget));

        vm.prank(creator);
        (address token, address hook, address router) = factory.createTokenWithV4MigrationProfile(
            "Hooked", "HOOK", "ipfs://hooked", "https://hooked.example", 25, profileId
        );

        IEulrFactory.TokenInfo memory info = factory.getTokenInfo(token);
        assertEq(info.creator, creator);
        assertEq(info.hook, hook);
        assertEq(info.router, router);
        assertEq(EulrHook(payable(hook)).migrationTarget(), address(profileTarget));
        assertEq(factory.tokenV4MigrationProfileId(token), profileId);
        assertEq(EulrHook(payable(hook)).getCurveParams().s, 25e18);
    }

    function test_CreateTokenAndBuyWithV4MigrationProfileBindsTargetAndBuysForRecipient() public {
        MockMigrationTarget profileTarget = new MockMigrationTarget();
        IEulrFactory.V4MigrationProfile memory profile = IEulrFactory.V4MigrationProfile({
            hookRegistryEntryId: 0,
            migrationTarget: address(profileTarget),
            hooks: address(0xC0c8),
            poolFee: 3_000,
            tickSpacing: 60,
            tickLower: -120,
            tickUpper: 120,
            hookDataHash: keccak256("hook-data"),
            active: true
        });
        uint256 profileId = factory.registerV4MigrationProfile(profile);

        vm.deal(creator, 1 ether);
        vm.prank(creator);
        (address token, address hook,) = factory.createTokenAndBuyWithV4MigrationProfile{value: 1 ether}(
            "HookBuy", "HBUY", "ipfs://hook-buy", "", 100, profileId, 0, recipient
        );

        assertGt(EulrToken(token).balanceOf(recipient), 0);
        assertEq(EulrHook(payable(hook)).migrationTarget(), address(profileTarget));
        assertEq(factory.tokenV4MigrationProfileId(token), profileId);
    }
}
