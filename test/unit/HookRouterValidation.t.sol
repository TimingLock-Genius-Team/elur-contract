// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {CurveParams} from "../../src/curve/CurveTypes.sol";
import {Curve} from "../../src/curve/Curve.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {IEulrFactory} from "../../src/interfaces/IEulrFactory.sol";
import {MockMigrationTarget} from "../mocks/MockMigrationTarget.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/// @dev Covers the constructor and one-shot setter reverts on `EulrHook` and
/// `EulrRouter` that the regular factory-driven integration tests cannot
/// reach. These are defense-in-depth guards: production deployments always go
/// through `EulrFactory.createToken`, which wires the trio correctly, but the
/// reverts must still be reachable when the contracts are deployed in
/// isolation (e.g. during emergency redeploys or fork experimentation).
contract HookRouterValidationTest is Test {
    EulrToken internal token;
    MockMigrationTarget internal migrationTarget;
    EulrHook internal hookImplementation;
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal factory = makeAddr("factory");

    function setUp() public {
        token = new EulrToken("Demo", "DEMO", address(this));
        migrationTarget = new MockMigrationTarget();
        hookImplementation = new EulrHook();
    }

    function test_HookInitializeRejectsEachZeroDependencyAddress() public {
        CurveParams memory params = Curve.defaultParams();

        vm.expectRevert(EulrHook.ZeroAddress.selector);
        _deployHook(EulrToken(payable(address(0))), feeRecipient, factory, address(migrationTarget), params);

        vm.expectRevert(EulrHook.ZeroAddress.selector);
        _deployHook(token, address(0), factory, address(migrationTarget), params);

        vm.expectRevert(EulrHook.ZeroAddress.selector);
        _deployHook(token, feeRecipient, address(0), address(migrationTarget), params);

        vm.expectRevert(EulrHook.ZeroAddress.selector);
        _deployHook(token, feeRecipient, factory, address(0), params);
    }

    function test_HookSetRouterRejectsZeroAndPreventsRebinding() public {
        CurveParams memory params = Curve.defaultParams();
        EulrHook hook = _deployHook(token, feeRecipient, factory, address(migrationTarget), params);

        vm.prank(makeAddr("not-factory"));
        vm.expectRevert(EulrHook.OnlyFactory.selector);
        hook.setRouter(makeAddr("router"));

        vm.prank(factory);
        vm.expectRevert(EulrHook.ZeroAddress.selector);
        hook.setRouter(address(0));

        address router = makeAddr("router");
        vm.prank(factory);
        hook.setRouter(router);
        assertEq(hook.router(), router);

        vm.prank(factory);
        vm.expectRevert(EulrHook.RouterAlreadySet.selector);
        hook.setRouter(makeAddr("another-router"));
    }

    function test_RouterConstructorRejectsEachZeroDependencyAddress() public {
        CurveParams memory params = Curve.defaultParams();
        EulrHook hook = _deployHook(token, feeRecipient, factory, address(migrationTarget), params);
        IEulrFactory factoryInterface = IEulrFactory(factory);
        EulrRouter implementation = new EulrRouter();

        vm.expectRevert(EulrRouter.ZeroAddress.selector);
        new TransparentUpgradeableProxy(
            address(implementation),
            address(this),
            abi.encodeCall(EulrRouter.initialize, (IEulrFactory(address(0)), token, hook))
        );

        vm.expectRevert(EulrRouter.ZeroAddress.selector);
        new TransparentUpgradeableProxy(
            address(implementation),
            address(this),
            abi.encodeCall(EulrRouter.initialize, (factoryInterface, EulrToken(payable(address(0))), hook))
        );

        vm.expectRevert(EulrRouter.ZeroAddress.selector);
        new TransparentUpgradeableProxy(
            address(implementation),
            address(this),
            abi.encodeCall(EulrRouter.initialize, (factoryInterface, token, EulrHook(payable(address(0)))))
        );
    }

    function test_HookBuyAndSellRejectZeroPayerOrRecipient() public {
        CurveParams memory params = Curve.defaultParams();
        EulrHook hook = _deployHook(token, feeRecipient, factory, address(migrationTarget), params);

        address router = address(this);
        vm.prank(factory);
        hook.setRouter(router);

        vm.deal(router, 1 ether);
        vm.expectRevert(EulrHook.ZeroAddress.selector);
        hook.buy{value: 1 ether}(address(0), makeAddr("recipient"), 0);

        vm.expectRevert(EulrHook.ZeroAddress.selector);
        hook.buy{value: 1 ether}(makeAddr("payer"), address(0), 0);

        vm.expectRevert(EulrHook.ZeroAddress.selector);
        hook.sell(address(0), makeAddr("recipient"), 1, 0);

        vm.expectRevert(EulrHook.ZeroAddress.selector);
        hook.sell(makeAddr("seller"), address(0), 1, 0);
    }

    function _deployHook(
        EulrToken token_,
        address feeRecipient_,
        address factory_,
        address migrationTarget_,
        CurveParams memory params
    ) internal returns (EulrHook) {
        return EulrHook(
            payable(address(
                    new TransparentUpgradeableProxy(
                        address(hookImplementation),
                        address(this),
                        abi.encodeCall(EulrHook.initialize, (token_, feeRecipient_, factory_, migrationTarget_, params))
                    )
                ))
        );
    }
}
