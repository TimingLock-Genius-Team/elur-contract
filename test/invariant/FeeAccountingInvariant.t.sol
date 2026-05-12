// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";
import {UserHandler} from "../handlers/UserHandler.sol";

contract FeeAccountingInvariantTest is StdInvariant, SatpadTestBase {
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

    function invariant_FeeRecipientBalanceEqualsCollectedFees() public view {
        assertEq(feeRecipient.balance, handler.ghostFeeCollected(), "fee recipient balance");
    }

    function invariant_FeesNeverEnterCurveReserve() public view {
        assertApproxEqAbs(address(hook).balance, hook.okbCum(), 10_000, "hook reserve excludes fees");
    }
}
