// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BuyQuote, CurveParams, SellQuote} from "../../src/curve/CurveTypes.sol";
import {Curve} from "../../src/curve/Curve.sol";

contract CurveHarness {
    function defaultParams() external pure returns (CurveParams memory) {
        return Curve.defaultParams();
    }

    function marginalPrice(uint256 okbCum) external pure returns (uint256) {
        return Curve.marginalPrice(okbCum, Curve.defaultParams());
    }

    function totalMinted(uint256 okbCum) external pure returns (uint256) {
        return Curve.totalMinted(okbCum, Curve.defaultParams());
    }

    function okbAtMinted(uint256 minted) external pure returns (uint256) {
        return Curve.okbAtMinted(minted, Curve.defaultParams());
    }

    function quoteBuy(uint256 okbCum, uint256 grossOkbIn) external pure returns (BuyQuote memory) {
        return Curve.quoteBuy(okbCum, grossOkbIn, Curve.defaultParams());
    }

    function quoteSell(uint256 okbCum, uint256 tokensIn) external pure returns (SellQuote memory) {
        return Curve.quoteSell(okbCum, tokensIn, Curve.defaultParams());
    }

    function isSelfDeprecated(uint256 okbCum) external pure returns (bool) {
        return Curve.isSelfDeprecated(okbCum, Curve.defaultParams());
    }
}
