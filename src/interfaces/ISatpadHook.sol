// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BuyQuote, CurveParams, SellQuote} from "../curve/CurveTypes.sol";

interface ISatpadHook {
    function token() external view returns (address);
    function router() external view returns (address);
    function okbCum() external view returns (uint256);
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
    function migrateLiquidity(bytes calldata migrationData) external returns (address pool, uint256 liquidity);
}
