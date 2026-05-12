// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Curve} from "../../src/curve/Curve.sol";
import {CurveParams} from "../../src/curve/CurveTypes.sol";
import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";
import {UserHandler} from "../handlers/UserHandler.sol";

contract GraduationInvariantTest is StdInvariant, SatpadTestBase {
    SatpadToken internal token;
    SatpadHook internal hook;
    SatpadRouter internal router;
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
