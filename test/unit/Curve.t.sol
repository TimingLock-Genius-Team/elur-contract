// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BuyQuote, CurveParams, SellQuote} from "../../src/curve/CurveTypes.sol";
import {Curve} from "../../src/curve/Curve.sol";
import {CurveHarness} from "../harness/CurveHarness.sol";

contract CurveTest is Test {
    CurveHarness internal curve;
    CurveParams internal params;

    function setUp() public {
        curve = new CurveHarness();
        params = curve.defaultParams();
    }

    function test_TotalMintedAtZeroIsZero() public view {
        assertEq(curve.totalMinted(0), 0);
    }

    function test_TotalMintedAtGraduationOkbIsApproximatelyNinetyNinePercentOfK() public view {
        uint256 minted = curve.totalMinted(460.517e18);
        uint256 threshold = (params.k * params.selfDeprecationBps) / 10_000;

        assertApproxEqAbs(minted, threshold, 2_000e18);
    }

    function test_OkbAtMintedInvertsTotalMintedWithinDust() public view {
        uint256 okbCum = 123.456e18;
        uint256 minted = curve.totalMinted(okbCum);
        uint256 roundtrip = curve.okbAtMinted(minted);

        assertApproxEqAbs(roundtrip, okbCum, 1_000);
    }

    function test_RevertWhen_OkbAtMintedEqualsK() public {
        vm.expectRevert(Curve.MintedOutOfRange.selector);
        curve.okbAtMinted(params.k);
    }

    function test_RevertWhen_ParamsAreInvalid() public {
        CurveParams memory invalid = params;
        invalid.k = 0;

        vm.expectRevert(Curve.InvalidCurveParams.selector);
        curve.validateParams(invalid);
    }

    function test_QuoteBuyKeepsFeeOutOfOkbCum() public view {
        BuyQuote memory quote = curve.quoteBuy(100e18, 10e18);

        assertEq(quote.fee, 0.03e18);
        assertEq(quote.effectiveOkbIn, 9.97e18);
        assertEq(quote.newOkbCum, 109.97e18);
        assertGt(quote.tokensOut, 0);
    }

    function test_QuoteSellReducesOkbCumAndChargesFee() public view {
        BuyQuote memory buyQuote = curve.quoteBuy(0, 1e18);
        SellQuote memory sellQuote = curve.quoteSell(buyQuote.newOkbCum, buyQuote.tokensOut / 2);

        assertLt(sellQuote.newOkbCum, buyQuote.newOkbCum);
        assertGt(sellQuote.grossOkbOut, sellQuote.netOkbOut);
        assertEq(sellQuote.fee, (sellQuote.grossOkbOut * params.feeBps) / 10_000);
    }

    function test_RevertWhen_QuoteSellExceedsMinted() public {
        vm.expectRevert(Curve.MintedOutOfRange.selector);
        curve.quoteSell(0, 1);
    }

    function testFuzz_TotalMintedAndPriceAreMonotonic(uint256 a, uint256 b) public view {
        a = bound(a, 0, 460e18);
        b = bound(b, 0, 460e18);
        if (a > b) {
            (a, b) = (b, a);
        }

        assertLe(curve.totalMinted(a), curve.totalMinted(b));
        assertLe(curve.marginalPrice(a), curve.marginalPrice(b));
    }
}
