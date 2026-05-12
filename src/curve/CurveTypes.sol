// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

struct CurveParams {
    uint256 k;
    uint256 s;
    uint16 feeBps;
    uint16 selfDeprecationBps;
    uint256 maxBuyOkb;
}

struct BuyQuote {
    uint256 grossOkbIn;
    uint256 fee;
    uint256 effectiveOkbIn;
    uint256 oldOkbCum;
    uint256 newOkbCum;
    uint256 oldMinted;
    uint256 newMinted;
    uint256 tokensOut;
}

struct SellQuote {
    uint256 tokensIn;
    uint256 grossOkbOut;
    uint256 fee;
    uint256 netOkbOut;
    uint256 oldOkbCum;
    uint256 newOkbCum;
    uint256 oldMinted;
    uint256 newMinted;
}
