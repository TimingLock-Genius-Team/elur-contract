// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BuyQuote, SellQuote} from "../curve/CurveTypes.sol";

interface IEulrRouter {
    function buy(address token, uint256 minTokensOut, address recipient) external payable returns (uint256 tokensOut);
    function sell(address token, uint256 tokensIn, uint256 minOkbOut, address recipient)
        external
        returns (uint256 okbOut);
    function quoteBuy(address token, uint256 okbIn) external view returns (BuyQuote memory);
    function quoteSell(address token, uint256 tokensIn) external view returns (SellQuote memory);
}
