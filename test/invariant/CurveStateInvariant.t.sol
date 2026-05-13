// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Curve} from "../../src/curve/Curve.sol";
import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {UserHandler} from "../handlers/UserHandler.sol";

contract CurveStateInvariantTest is StdInvariant, EulrTestBase {
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

    function invariant_HookReserveTracksOkbCum() public view {
        assertApproxEqAbs(
            address(hook).balance - hook.claimableFeeOkb(), hook.okbCum(), 10_000, "reserve must track okbCum"
        );
    }

    function invariant_RouterNeverKeepsAssets() public view {
        assertEq(address(router).balance, 0, "router OKB balance");
        assertEq(token.balanceOf(address(router)), 0, "router token balance");
    }

    function invariant_TokenSupplyTracksCurveMintedWithinDust() public view {
        uint256 curveMinted = Curve.totalMinted(hook.okbCum(), hook.getCurveParams());
        assertApproxEqAbs(token.totalSupply(), curveMinted, 1e12, "supply must track curve minted");
    }
}
