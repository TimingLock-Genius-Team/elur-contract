// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {MockMigrationTarget} from "../mocks/MockMigrationTarget.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {ITransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract EulrRouterV2 is EulrRouter {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract EulrHookV2 is EulrHook {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract TransparentProxyUpgradeTest is Test {
    bytes32 internal constant ERC1967_ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
    bytes32 internal constant ERC1967_IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    address internal deployer = makeAddr("deployer");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal creator = makeAddr("creator");

    MockMigrationTarget internal migrationTarget;
    EulrFactory internal factoryImplementation;
    EulrHook internal hookImplementation;
    EulrRouter internal routerImplementation;
    EulrFactory internal factory;

    function setUp() public {
        migrationTarget = new MockMigrationTarget();

        vm.startPrank(deployer);
        hookImplementation = new EulrHook();
        routerImplementation = new EulrRouter();
        factoryImplementation = new EulrFactory();
        TransparentUpgradeableProxy factoryProxy = new TransparentUpgradeableProxy(
            address(factoryImplementation),
            deployer,
            abi.encodeCall(
                EulrFactory.initialize,
                (feeRecipient, address(migrationTarget), address(routerImplementation), deployer, deployer)
            )
        );
        factory = EulrFactory(address(factoryProxy));
        vm.stopPrank();
    }

    function test_FactoryProxyInitializesConfigAndLocksImplementation() public {
        assertEq(factory.feeRecipient(), feeRecipient);
        assertEq(factory.migrationTarget(), address(migrationTarget));
        assertEq(factory.hookImplementation(), address(0));
        assertEq(factory.routerImplementation(), address(routerImplementation));
        assertEq(factory.routerProxyOwner(), deployer);
        assertEq(factory.upgradeAdmin(), deployer);

        vm.expectRevert();
        factoryImplementation.initialize(
            feeRecipient, address(migrationTarget), address(routerImplementation), deployer, deployer
        );
    }

    function test_CreateTokenRevertsUntilHookImplementationIsConfigured() public {
        vm.prank(creator);
        vm.expectRevert(EulrFactory.HookImplementationMissing.selector);
        factory.createToken("Demo", "DEMO", "ipfs://demo", "");
    }

    function test_CreateTokenBindsHookToRouterProxy() public {
        vm.prank(deployer);
        factory.setHookImplementation(address(hookImplementation));

        vm.prank(creator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            factory.createToken("Demo", "DEMO", "ipfs://demo", "https://demo.example");

        EulrHook hook = EulrHook(payable(hookAddr));
        EulrRouter router = EulrRouter(payable(routerAddr));

        assertEq(hook.router(), routerAddr);
        assertEq(address(router.factory()), address(factory));
        assertEq(address(router.token()), tokenAddr);
        assertEq(address(router.hook()), hookAddr);
        assertEq(address(hook.token()), tokenAddr);
        assertEq(hook.feeRecipient(), feeRecipient);
        assertEq(hook.factory(), address(factory));
        assertEq(hook.migrationTarget(), address(migrationTarget));
        assertEq(_proxyImplementation(hookAddr), address(hookImplementation));
        assertEq(ProxyAdmin(_proxyAdmin(hookAddr)).owner(), deployer);
        assertEq(_proxyImplementation(routerAddr), address(routerImplementation));
        assertEq(ProxyAdmin(_proxyAdmin(routerAddr)).owner(), deployer);
    }

    function test_ProxyAdminCanUpgradeCreatedRouterProxy() public {
        vm.prank(deployer);
        factory.setHookImplementation(address(hookImplementation));

        vm.prank(creator);
        (address tokenAddr,, address routerAddr) = factory.createToken("Demo", "DEMO", "ipfs://demo", "");

        EulrRouterV2 routerV2 = new EulrRouterV2();

        vm.prank(deployer);
        ProxyAdmin(_proxyAdmin(routerAddr))
            .upgradeAndCall(ITransparentUpgradeableProxy(routerAddr), address(routerV2), "");

        assertEq(EulrRouterV2(payable(routerAddr)).version(), 2);
        assertEq(address(EulrRouter(payable(routerAddr)).factory()), address(factory));
        assertEq(address(EulrRouter(payable(routerAddr)).token()), tokenAddr);
    }

    function test_UpgradeAdminCanSetFutureRouterImplementation() public {
        vm.prank(deployer);
        factory.setHookImplementation(address(hookImplementation));
        EulrRouterV2 routerV2 = new EulrRouterV2();

        vm.prank(deployer);
        factory.setRouterImplementation(address(routerV2));

        vm.prank(creator);
        (,, address routerAddr) = factory.createToken("Demo", "DEMO", "ipfs://demo", "");

        assertEq(_proxyImplementation(routerAddr), address(routerV2));
        assertEq(EulrRouterV2(payable(routerAddr)).version(), 2);
    }

    function test_ProxyAdminCanUpgradeCreatedHookProxyAndPreserveState() public {
        vm.prank(deployer);
        factory.setHookImplementation(address(hookImplementation));

        vm.prank(creator);
        (address tokenAddr, address hookAddr, address routerAddr) = factory.createToken("Demo", "DEMO", "ipfs://demo", "");

        EulrRouter router = EulrRouter(payable(routerAddr));
        EulrToken token = EulrToken(tokenAddr);
        vm.deal(creator, 2 ether);
        vm.prank(creator);
        router.buy{value: 2 ether}(tokenAddr, 0, creator);

        uint256 okbCumBefore = EulrHook(payable(hookAddr)).okbCum();
        uint256 burnedBefore = EulrHook(payable(hookAddr)).taxBurnedTokens();
        uint256 balanceBefore = token.balanceOf(creator);
        EulrHookV2 hookV2 = new EulrHookV2();

        vm.prank(deployer);
        ProxyAdmin(_proxyAdmin(hookAddr)).upgradeAndCall(ITransparentUpgradeableProxy(hookAddr), address(hookV2), "");

        assertEq(EulrHookV2(payable(hookAddr)).version(), 2);
        assertEq(EulrHook(payable(hookAddr)).okbCum(), okbCumBefore);
        assertEq(EulrHook(payable(hookAddr)).taxBurnedTokens(), burnedBefore);
        assertEq(EulrHook(payable(hookAddr)).router(), routerAddr);
        assertEq(address(EulrHook(payable(hookAddr)).token()), tokenAddr);
        assertEq(token.balanceOf(creator), balanceBefore);
    }

    function _proxyAdmin(address proxy) internal view returns (address) {
        return address(uint160(uint256(vm.load(proxy, ERC1967_ADMIN_SLOT))));
    }

    function _proxyImplementation(address proxy) internal view returns (address) {
        return address(uint160(uint256(vm.load(proxy, ERC1967_IMPLEMENTATION_SLOT))));
    }
}
