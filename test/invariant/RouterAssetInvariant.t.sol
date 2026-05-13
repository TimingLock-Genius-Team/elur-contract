// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {UserHandler} from "../handlers/UserHandler.sol";

contract RouterAssetInvariantTest is StdInvariant, EulrTestBase {
    EulrToken internal token;
    EulrHook internal hook;
    EulrRouter internal router;
    UserHandler internal handler;

    function setUp() public override {
        super.setUp();
        (token, hook, router) = createDemoToken();
        handler = new UserHandler(token, hook, router);
        targetContract(address(handler));
    }

    function invariant_RouterNeverHoldsNativeOkbOrToken() public view {
        assertEq(address(router).balance, 0, "router native balance");
        assertEq(token.balanceOf(address(router)), 0, "router token balance");
    }
}
