// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {UD60x18, ud} from "prb-math/UD60x18.sol";
import {BuyQuote, CurveParams, SellQuote} from "./CurveTypes.sol";

library Curve {
    uint256 internal constant WAD = 1e18;
    uint16 internal constant BPS_DENOMINATOR = 10_000;

    error InvalidCurveParams();
    error GrossOkbInZero();
    error GrossOkbInTooLarge();
    error TokensInZero();
    error MintedOutOfRange();

    function defaultParams() internal pure returns (CurveParams memory) {
        return CurveParams({
            k: 21_000_000e18,
            s: 100e18,
            feeBps: 30,
            burnTaxMinBps: 0,
            burnTaxMaxBps: 0,
            selfDeprecationBps: 8000,
            maxBuyOkb: 10e18
        });
    }

    function validateParams(CurveParams memory params) internal pure {
        if (
            params.k == 0 || params.s == 0 || params.feeBps > BPS_DENOMINATOR || params.burnTaxMinBps > BPS_DENOMINATOR
                || params.burnTaxMaxBps > BPS_DENOMINATOR || params.burnTaxMinBps > params.burnTaxMaxBps
                || params.selfDeprecationBps > BPS_DENOMINATOR || params.selfDeprecationBps == 0
                || params.maxBuyOkb == 0
        ) {
            revert InvalidCurveParams();
        }
    }

    function marginalPrice(uint256 okbCum, CurveParams memory params) internal pure returns (uint256) {
        validateParams(params);

        UD60x18 exponent = ud(okbCum).div(ud(params.s));
        return ud(params.s).div(ud(params.k)).mul(exponent.exp()).unwrap();
    }

    function totalMinted(uint256 okbCum, CurveParams memory params) internal pure returns (uint256) {
        validateParams(params);
        if (okbCum == 0) {
            return 0;
        }

        UD60x18 exponent = ud(okbCum).div(ud(params.s));
        UD60x18 inverseExp = ud(WAD).div(exponent.exp());
        return ud(params.k).mul(ud(WAD).sub(inverseExp)).unwrap();
    }

    function okbAtMinted(uint256 minted, CurveParams memory params) internal pure returns (uint256) {
        validateParams(params);
        if (minted >= params.k) {
            revert MintedOutOfRange();
        }
        if (minted == 0) {
            return 0;
        }

        UD60x18 ratio = ud(params.k).div(ud(params.k - minted));
        return ud(params.s).mul(ratio.ln()).unwrap();
    }

    function quoteBuy(uint256 okbCum, uint256 grossOkbIn, CurveParams memory params)
        internal
        pure
        returns (BuyQuote memory quote)
    {
        validateParams(params);
        if (grossOkbIn == 0) {
            revert GrossOkbInZero();
        }
        if (grossOkbIn > params.maxBuyOkb) {
            revert GrossOkbInTooLarge();
        }

        uint256 fee = (grossOkbIn * params.feeBps) / BPS_DENOMINATOR;
        uint256 effectiveOkbIn = grossOkbIn - fee;
        uint256 oldMinted = totalMinted(okbCum, params);
        uint256 newOkbCum = okbCum + effectiveOkbIn;
        uint256 newMinted = totalMinted(newOkbCum, params);
        uint256 grossTokensOut = newMinted - oldMinted;

        quote = BuyQuote({
            grossOkbIn: grossOkbIn,
            fee: fee,
            effectiveOkbIn: effectiveOkbIn,
            oldOkbCum: okbCum,
            newOkbCum: newOkbCum,
            oldMinted: oldMinted,
            newMinted: newMinted,
            tokensOut: grossTokensOut,
            burnTaxBps: 0,
            grossTokensOut: grossTokensOut,
            burnTaxTokens: 0
        });
    }

    function quoteSell(uint256 okbCum, uint256 tokensIn, CurveParams memory params)
        internal
        pure
        returns (SellQuote memory quote)
    {
        validateParams(params);
        if (tokensIn == 0) {
            revert TokensInZero();
        }

        uint256 oldMinted = totalMinted(okbCum, params);
        uint256 effectiveTokensIn = tokensIn;
        if (effectiveTokensIn > oldMinted) {
            revert MintedOutOfRange();
        }

        uint256 newMinted = oldMinted - effectiveTokensIn;
        uint256 newOkbCum = okbAtMinted(newMinted, params);
        uint256 grossOkbOut = okbCum - newOkbCum;
        uint256 fee = (grossOkbOut * params.feeBps) / BPS_DENOMINATOR;

        quote = SellQuote({
            tokensIn: tokensIn,
            grossOkbOut: grossOkbOut,
            fee: fee,
            netOkbOut: grossOkbOut - fee,
            oldOkbCum: okbCum,
            newOkbCum: newOkbCum,
            oldMinted: oldMinted,
            newMinted: newMinted,
            burnTaxBps: 0,
            burnTaxTokens: 0,
            effectiveTokensIn: effectiveTokensIn
        });
    }

    function burnTaxBps(uint256 okbCum, CurveParams memory params) internal pure returns (uint16) {
        validateParams(params);
        okbCum;
        return 0;
    }

    function isSelfDeprecated(uint256 okbCum, CurveParams memory params) internal pure returns (bool) {
        validateParams(params);
        return totalMinted(okbCum, params) >= ((params.k * params.selfDeprecationBps) / BPS_DENOMINATOR);
    }
}
