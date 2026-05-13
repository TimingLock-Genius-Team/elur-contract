// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Curve} from "../../src/curve/Curve.sol";
import {CurveParams} from "../../src/curve/CurveTypes.sol";
import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {UserHandler} from "../handlers/UserHandler.sol";

contract GraduationInvariantTest is StdInvariant, EulrTestBase {
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

    function invariant_SelfDeprecatedMatchesCurveThreshold() public view {
        CurveParams memory params = hook.getCurveParams();
        uint256 minted = Curve.totalMinted(hook.okbCum(), params);
        uint256 threshold = (params.k * params.selfDeprecationBps) / 10_000;

        if (hook.selfDeprecated()) {
            assertGe(minted, threshold, "deprecated only after threshold");
        } else {
            assertLt(minted, threshold, "not deprecated before threshold");
        }
    }

    function invariant_LiquidityMigrationDoesNotHappenSpontaneously() public view {
        assertFalse(hook.liquidityMigrated(), "handler never calls migration");
    }
}
