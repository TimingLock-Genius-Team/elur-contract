// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {CurveParams} from "../../src/curve/CurveTypes.sol";
import {IEulrFactory} from "../../src/interfaces/IEulrFactory.sol";
import {IEulrHookRegistry} from "../../src/interfaces/IEulrHookRegistry.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrHookRegistry} from "../../src/registry/EulrHookRegistry.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {MockMigrationTarget} from "../mocks/MockMigrationTarget.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract MockAllowlistMigrationTarget {
    address public expectedHooks;
    uint24 public expectedPoolFee;
    int24 public expectedTickSpacing;
    int24 public expectedTickLower;
    int24 public expectedTickUpper;
    bytes32 public expectedHookDataHash;

    constructor(
        address expectedHooks_,
        uint24 expectedPoolFee_,
        int24 expectedTickSpacing_,
        int24 expectedTickLower_,
        int24 expectedTickUpper_,
        bytes32 expectedHookDataHash_
    ) {
        expectedHooks = expectedHooks_;
        expectedPoolFee = expectedPoolFee_;
        expectedTickSpacing = expectedTickSpacing_;
        expectedTickLower = expectedTickLower_;
        expectedTickUpper = expectedTickUpper_;
        expectedHookDataHash = expectedHookDataHash_;
    }
}

contract FactoryValidationTest is EulrTestBase {
    uint160 internal constant BEFORE_AFTER_FLAGS = 0x00c0;

    event TokenCreated(
        address indexed token,
        address indexed hook,
        address router,
        address indexed creator,
        string metadataURI,
        string socialURI,
        uint16 curveS
    );

    function test_RevertWhen_ExternalDependencyHasNoCode() public {
        EulrFactory implementation = new EulrFactory();

        vm.expectRevert(abi.encodeWithSelector(EulrFactory.MissingExternalCode.selector, address(0x5678)));
        new TransparentUpgradeableProxy(
            address(implementation),
            address(this),
            abi.encodeCall(
                EulrFactory.initialize,
                (feeRecipient, address(0x5678), address(routerImplementation), address(this), address(this))
            )
        );
    }

    function test_AdminSettersRejectUnauthorizedZeroAndMissingCodeInputs() public {
        vm.prank(creator);
        vm.expectRevert(EulrFactory.OnlyUpgradeAdmin.selector);
        factory.setRouterImplementation(address(routerImplementation));

        vm.expectRevert(EulrFactory.ZeroAddress.selector);
        factory.setRouterImplementation(address(0));

        vm.expectRevert(abi.encodeWithSelector(EulrFactory.MissingExternalCode.selector, makeAddr("routerImpl")));
        factory.setRouterImplementation(makeAddr("routerImpl"));

        vm.expectRevert(EulrFactory.ZeroAddress.selector);
        factory.setHookImplementation(address(0));

        vm.expectRevert(abi.encodeWithSelector(EulrFactory.MissingExternalCode.selector, makeAddr("hookImpl")));
        factory.setHookImplementation(makeAddr("hookImpl"));

        vm.expectRevert(EulrFactory.ZeroAddress.selector);
        factory.setHookRegistry(address(0));

        vm.expectRevert(abi.encodeWithSelector(EulrFactory.MissingExternalCode.selector, makeAddr("registry")));
        factory.setHookRegistry(makeAddr("registry"));

        vm.expectRevert(EulrFactory.UnknownV4MigrationProfile.selector);
        factory.setV4MigrationProfileActive(1, true);
    }

    function test_RevertWhen_NameOrSymbolInvalid() public {
        vm.expectRevert(EulrFactory.EmptyName.selector);
        factory.createToken("", "DEMO", "ipfs://demo", "");

        vm.expectRevert(EulrFactory.EmptySymbol.selector);
        factory.createToken("Demo", "", "ipfs://demo", "");

        vm.expectRevert(EulrFactory.NameTooLong.selector);
        factory.createToken(_stringOfLength(65), "DEMO", "ipfs://demo", "");

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
        assertEq(params.burnTaxMinBps, 100);
        assertEq(params.burnTaxMaxBps, 1_000);
        assertEq(params.selfDeprecationBps, 8000);
        assertEq(params.maxBuyOkb, 10e18);

        CurveParams memory factoryParams = factory.curveParams();
        assertEq(factoryParams.k, params.k);
        assertEq(factoryParams.s, params.s);
        assertEq(factoryParams.feeBps, params.feeBps);
        assertEq(factoryParams.burnTaxMinBps, params.burnTaxMinBps);
        assertEq(factoryParams.burnTaxMaxBps, params.burnTaxMaxBps);
        assertEq(factoryParams.selfDeprecationBps, params.selfDeprecationBps);
        assertEq(factoryParams.maxBuyOkb, params.maxBuyOkb);
    }

    function test_CreateTokenUsesCreatorSelectedCurveS() public {
        (, EulrHook hook,) = createToken("Steep", "STEEP", creator, 25);

        CurveParams memory params = hook.getCurveParams();
        assertEq(params.k, 21_000_000e18);
        assertEq(params.s, 25e18);
        assertEq(params.feeBps, 30);
        assertEq(params.burnTaxMinBps, 100);
        assertEq(params.burnTaxMaxBps, 1_000);
        assertEq(params.selfDeprecationBps, 8000);
        assertEq(params.maxBuyOkb, 10e18);
    }

    function test_CreateTokenUsesCreatorSelectedDualTaxParams() public {
        vm.prank(creator);
        (, address hookAddr,) = factory.createToken("Custom", "CUST", "ipfs://custom", "", 25, 75, 200, 800);

        CurveParams memory params = EulrHook(payable(hookAddr)).getCurveParams();
        assertEq(params.s, 25e18);
        assertEq(params.feeBps, 75);
        assertEq(params.burnTaxMinBps, 200);
        assertEq(params.burnTaxMaxBps, 800);
    }

    function test_TokenCreatedEmitsCreatorSelectedCurveS() public {
        vm.expectEmit(false, false, false, false);
        emit TokenCreated(address(0), address(0), address(0), creator, "ipfs://demo", "https://demo.example", 25);

        vm.prank(creator);
        factory.createToken("Steep", "STEEP", "ipfs://demo", "https://demo.example", 25);
    }

    function test_CreateTokenAcceptsCurveSBoundaryValues() public {
        vm.prank(creator);
        (, address minHookAddr,) = factory.createToken("Min", "MIN", "ipfs://min", "", 1);
        assertEq(EulrHook(payable(minHookAddr)).getCurveParams().s, 1e18);

        vm.prank(creator);
        (, address maxHookAddr,) = factory.createToken("Max", "MAX", "ipfs://max", "", 1000);
        assertEq(EulrHook(payable(maxHookAddr)).getCurveParams().s, 1000e18);
    }

    function test_RevertWhen_CurveSOutsideAllowedRange() public {
        vm.expectRevert(EulrFactory.InvalidCurveS.selector);
        factory.createToken("Zero", "ZERO", "ipfs://zero", "", 0);

        vm.expectRevert(EulrFactory.InvalidCurveS.selector);
        factory.createToken("TooFlat", "FLAT", "ipfs://flat", "", 1001);
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

    function test_RegisterV4MigrationProfileStoresAllowlistedPoolConfig() public {
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
        IEulrFactory.V4MigrationProfile memory stored = factory.getV4MigrationProfile(profileId);

        assertEq(profileId, 1);
        assertEq(factory.nextV4MigrationProfileId(), 1);
        assertEq(stored.migrationTarget, address(profileTarget));
        assertEq(stored.hooks, address(0xC0c8));
        assertEq(stored.poolFee, 3_000);
        assertEq(stored.tickSpacing, 60);
        assertEq(stored.tickLower, -120);
        assertEq(stored.tickUpper, 120);
        assertEq(stored.hookDataHash, keccak256("hook-data"));
        assertTrue(stored.active);
    }

    function test_RegisterV4MigrationProfileRejectsInvalidConfig() public {
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

        profile.migrationTarget = address(0);
        vm.expectRevert(EulrFactory.InvalidV4MigrationProfile.selector);
        factory.registerV4MigrationProfile(profile);

        profile.migrationTarget = address(0x1234);
        vm.expectRevert(abi.encodeWithSelector(EulrFactory.MissingExternalCode.selector, address(0x1234)));
        factory.registerV4MigrationProfile(profile);

        profile.migrationTarget = address(profileTarget);
        profile.hooks = address(0);
        vm.expectRevert(EulrFactory.InvalidV4MigrationProfile.selector);
        factory.registerV4MigrationProfile(profile);

        profile.hooks = address(0xC0c8);
        profile.poolFee = 0;
        vm.expectRevert(EulrFactory.InvalidV4MigrationProfile.selector);
        factory.registerV4MigrationProfile(profile);

        profile.poolFee = 3_000;
        profile.tickLower = 120;
        profile.tickUpper = -120;
        vm.expectRevert(EulrFactory.InvalidV4MigrationProfile.selector);
        factory.registerV4MigrationProfile(profile);

        profile.tickLower = -100;
        profile.tickUpper = 120;
        vm.expectRevert(EulrFactory.InvalidV4MigrationProfile.selector);
        factory.registerV4MigrationProfile(profile);
    }

    function test_RegisterV4MigrationProfileRejectsRegistryAndAllowlistMismatches() public {
        MockMigrationTarget profileTarget = new MockMigrationTarget();
        IEulrFactory.V4MigrationProfile memory profile = IEulrFactory.V4MigrationProfile({
            hookRegistryEntryId: 1,
            migrationTarget: address(profileTarget),
            hooks: address(0xC0c8),
            poolFee: 3_000,
            tickSpacing: 60,
            tickLower: -120,
            tickUpper: 120,
            hookDataHash: keccak256("hook-data"),
            active: true
        });

        vm.expectRevert(EulrFactory.InvalidV4MigrationProfile.selector);
        factory.registerV4MigrationProfile(profile);

        MockAllowlistMigrationTarget allowlistTarget =
            new MockAllowlistMigrationTarget(address(0xBEEF), 3_000, 60, -120, 120, keccak256("hook-data"));
        profile.hookRegistryEntryId = 0;
        profile.migrationTarget = address(allowlistTarget);

        vm.expectRevert(EulrFactory.InvalidV4MigrationProfile.selector);
        factory.registerV4MigrationProfile(profile);
    }

    function test_V4MigrationProfileAdminControlsAndUnknownProfiles() public {
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

        vm.prank(creator);
        vm.expectRevert(EulrFactory.OnlyUpgradeAdmin.selector);
        factory.registerV4MigrationProfile(profile);

        vm.expectRevert(EulrFactory.UnknownV4MigrationProfile.selector);
        factory.getV4MigrationProfile(1);

        uint256 profileId = factory.registerV4MigrationProfile(profile);
        factory.setV4MigrationProfileActive(profileId, false);
        assertFalse(factory.getV4MigrationProfile(profileId).active);

        vm.expectRevert(EulrFactory.InactiveV4MigrationProfile.selector);
        factory.createTokenWithV4MigrationProfile("Demo", "DEMO", "ipfs://demo", "", 100, profileId);
    }

    function test_RegisterV4MigrationProfileRequiresApprovedRegistryEntry() public {
        EulrHookRegistry registry = new EulrHookRegistry(address(this));
        factory.setHookRegistry(address(registry));
        uint256 entryId = _submitRegistryHook(registry);

        MockMigrationTarget profileTarget = new MockMigrationTarget();
        IEulrFactory.V4MigrationProfile memory profile = IEulrFactory.V4MigrationProfile({
            hookRegistryEntryId: entryId,
            migrationTarget: address(profileTarget),
            hooks: address(uint160(0xBEEF) << 14 | BEFORE_AFTER_FLAGS),
            poolFee: 3_000,
            tickSpacing: 60,
            tickLower: -120,
            tickUpper: 120,
            hookDataHash: keccak256("hook-data"),
            active: true
        });

        vm.expectRevert(EulrFactory.InvalidV4MigrationProfile.selector);
        factory.registerV4MigrationProfile(profile);

        registry.markValidated(entryId, keccak256("validation"), "ipfs://validation");
        registry.markSimulated(entryId, keccak256("simulation"), "ipfs://simulation");
        registry.approveHook(entryId, _approvalConfig(registry));

        uint256 profileId = factory.registerV4MigrationProfile(profile);
        IEulrFactory.V4MigrationProfile memory stored = factory.getV4MigrationProfile(profileId);
        assertEq(stored.hookRegistryEntryId, entryId);
    }

    function test_CreateTokenWithV4MigrationProfileRejectsSuspendedRegistryEntry() public {
        EulrHookRegistry registry = new EulrHookRegistry(address(this));
        factory.setHookRegistry(address(registry));
        uint256 entryId = _approveRegistryHook(registry);

        MockMigrationTarget profileTarget = new MockMigrationTarget();
        IEulrFactory.V4MigrationProfile memory profile = IEulrFactory.V4MigrationProfile({
            hookRegistryEntryId: entryId,
            migrationTarget: address(profileTarget),
            hooks: address(uint160(0xBEEF) << 14 | BEFORE_AFTER_FLAGS),
            poolFee: 3_000,
            tickSpacing: 60,
            tickLower: -120,
            tickUpper: 120,
            hookDataHash: keccak256("hook-data"),
            active: true
        });

        uint256 profileId = factory.registerV4MigrationProfile(profile);
        registry.suspendHook(entryId, "operator pause");

        vm.prank(creator);
        vm.expectRevert(EulrFactory.InactiveV4MigrationProfile.selector);
        factory.createTokenWithV4MigrationProfile("Demo", "DEMO", "ipfs://demo", "", 25, profileId);
    }

    function test_CreateTokenWithV4MigrationProfilePaysTemplateFee() public {
        EulrHookRegistry registry = new EulrHookRegistry(address(this));
        factory.setHookRegistry(address(registry));
        uint256 entryId = _submitRegistryHook(registry);
        registry.markValidated(entryId, keccak256("validation"), "ipfs://validation");
        registry.markSimulated(entryId, keccak256("simulation"), "ipfs://simulation");
        registry.approveHook(entryId, _approvalConfigWithNativeFee(registry, 1 ether));

        MockMigrationTarget profileTarget = new MockMigrationTarget();
        IEulrFactory.V4MigrationProfile memory profile = IEulrFactory.V4MigrationProfile({
            hookRegistryEntryId: entryId,
            migrationTarget: address(profileTarget),
            hooks: address(uint160(0xBEEF) << 14 | BEFORE_AFTER_FLAGS),
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
        factory.createTokenWithV4MigrationProfile{value: 1 ether}("FeeHook", "FH", "ipfs://fee-hook", "", 25, profileId);

        assertEq(recipient.balance, 0.9 ether);
        assertEq(feeRecipient.balance, 0.1 ether);
    }

    function _submitRegistryHook(EulrHookRegistry registry) internal returns (uint256 entryId) {
        address hook = address(uint160(0xBEEF) << 14 | BEFORE_AFTER_FLAGS);
        vm.etch(hook, hex"60016000526001601ff3");
        entryId = registry.submitHook(
            IEulrHookRegistry.HookSubmission({
                hook: hook,
                author: creator,
                targetChainId: block.chainid,
                permissionMask: BEFORE_AFTER_FLAGS,
                metadataURI: "ipfs://hook",
                metadataHash: keccak256("metadata"),
                sourceMetadataHash: keccak256("source"),
                artifactMetadataHash: keccak256("artifact"),
                constructorArgsHash: keccak256("args"),
                exampleHookDataHash: keccak256("hook-data"),
                recommendedPoolFee: 3_000,
                recommendedTickSpacing: 60,
                riskLabelMask: 1
            })
        );
    }

    function _approveRegistryHook(EulrHookRegistry registry) internal returns (uint256 entryId) {
        entryId = _submitRegistryHook(registry);
        registry.markValidated(entryId, keccak256("validation"), "ipfs://validation");
        registry.markSimulated(entryId, keccak256("simulation"), "ipfs://simulation");
        registry.approveHook(entryId, _approvalConfig(registry));
    }

    function _approvalConfig(EulrHookRegistry registry)
        internal
        view
        returns (IEulrHookRegistry.ApprovalConfig memory config)
    {
        config = _approvalConfigWithNativeFee(registry, 0);
    }

    function _approvalConfigWithNativeFee(EulrHookRegistry registry, uint256 oneTimeFee)
        internal
        view
        returns (IEulrHookRegistry.ApprovalConfig memory config)
    {
        config = IEulrHookRegistry.ApprovalConfig({
            launchModes: registry.LAUNCH_MODE_CURVE_FIRST(),
            feeConfig: IEulrHookRegistry.TemplateFeeConfig({
                feeCurrency: address(0),
                oneTimeFee: oneTimeFee,
                creatorFeeRecipient: oneTimeFee == 0 ? address(0) : recipient,
                protocolFeeRecipient: oneTimeFee == 0 ? address(0) : feeRecipient,
                protocolFeeBps: oneTimeFee == 0 ? 0 : 1_000
            })
        });
    }

    function _stringOfLength(uint256 length) internal pure returns (string memory) {
        bytes memory data = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            data[i] = "a";
        }
        return string(data);
    }
}
