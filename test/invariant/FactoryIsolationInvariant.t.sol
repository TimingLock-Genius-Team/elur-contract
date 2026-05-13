// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {UserHandler} from "../handlers/UserHandler.sol";

contract FactoryIsolationInvariantTest is StdInvariant, EulrTestBase {
    EulrToken internal tokenA;
    EulrHook internal hookA;
    EulrRouter internal routerA;
    UserHandler internal handlerA;

    EulrToken internal tokenB;
    EulrHook internal hookB;
    EulrRouter internal routerB;
    UserHandler internal handlerB;

    function setUp() public override {
        super.setUp();
        (tokenA, hookA, routerA) = createToken("Alpha", "ALPHA", creator);
        (tokenB, hookB, routerB) = createToken("Beta", "BETA", creator);
        handlerA = new UserHandler(tokenA, hookA, routerA);
        handlerB = new UserHandler(tokenB, hookB, routerB);
        targetContract(address(handlerA));
        targetContract(address(handlerB));
    }

    function invariant_TokenBindingsNeverCross() public view {
        assertEq(tokenA.hook(), address(hookA), "token A hook");
        assertEq(tokenB.hook(), address(hookB), "token B hook");
        assertEq(address(routerA.token()), address(tokenA), "router A token");
        assertEq(address(routerB.token()), address(tokenB), "router B token");
        assertEq(address(routerA.hook()), address(hookA), "router A hook");
        assertEq(address(routerB.hook()), address(hookB), "router B hook");
        assertTrue(address(tokenA) != address(tokenB), "token address isolation");
        assertTrue(address(hookA) != address(hookB), "hook address isolation");
        assertTrue(address(routerA) != address(routerB), "router address isolation");
    }

    function invariant_RegisteredTokensRemainRegistered() public view {
        assertTrue(factory.isToken(address(tokenA)), "token A registered");
        assertTrue(factory.isToken(address(tokenB)), "token B registered");
        assertEq(factory.allTokensLength(), 2, "token registry length");
    }

    function invariant_EachHookReserveTracksOwnCurve() public view {
        assertApproxEqAbs(address(hookA).balance - hookA.claimableFeeOkb(), hookA.okbCum(), 10_000, "hook A reserve");
        assertApproxEqAbs(address(hookB).balance - hookB.claimableFeeOkb(), hookB.okbCum(), 10_000, "hook B reserve");
    }
}
