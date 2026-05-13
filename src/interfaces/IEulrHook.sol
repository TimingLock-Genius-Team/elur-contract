// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BuyQuote, CurveParams, SellQuote} from "../curve/CurveTypes.sol";
import {EulrToken} from "../token/EulrToken.sol";

interface IEulrHook {
    struct CurveState {
        uint256 okbCum;
        uint256 totalMinted;
        uint256 currentPrice;
        uint256 claimableFeeOkb;
        bool selfDeprecated;
        bool liquidityMigrated;
    }

    function token() external view returns (EulrToken);
    function router() external view returns (address);
    function okbCum() external view returns (uint256);
    function claimableFeeOkb() external view returns (uint256);
    function selfDeprecated() external view returns (bool);
    function liquidityMigrated() external view returns (bool);
    function getCurveParams() external view returns (CurveParams memory);
    function lastBuyBlock(address user) external view returns (uint256);

    function buy(address payer, address recipient, uint256 minTokensOut) external payable returns (uint256 tokensOut);

    function sell(address seller, address recipient, uint256 tokensIn, uint256 minOkbOut)
        external
        returns (uint256 okbOut);

    function quoteBuy(uint256 okbIn) external view returns (BuyQuote memory);
    function quoteSell(uint256 tokensIn) external view returns (SellQuote memory);
    function totalMinted() external view returns (uint256);
    function currentPrice() external view returns (uint256);
    function curveState() external view returns (CurveState memory);
    function claimFees(address recipient) external returns (uint256 amount);
    function migrateLiquidity(bytes calldata migrationData) external returns (address pool, uint256 liquidity);
}
