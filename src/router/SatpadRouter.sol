// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BuyQuote, SellQuote} from "../curve/CurveTypes.sol";
import {ISatpadFactory} from "../interfaces/ISatpadFactory.sol";
import {ISatpadRouter} from "../interfaces/ISatpadRouter.sol";
import {SatpadHook} from "../hook/SatpadHook.sol";
import {SatpadToken} from "../token/SatpadToken.sol";
import {ReentrancyGuard} from "../libraries/ReentrancyGuard.sol";

contract SatpadRouter is ISatpadRouter, ReentrancyGuard {
    ISatpadFactory public immutable factory;
    SatpadToken public immutable token;
    SatpadHook public immutable hook;

    error InvalidToken();
    error ZeroAddress();
    error TokenTransferFailed();

    constructor(ISatpadFactory factory_, SatpadToken token_, SatpadHook hook_) {
        if (address(factory_) == address(0) || address(token_) == address(0) || address(hook_) == address(0)) {
            revert ZeroAddress();
        }

        factory = factory_;
        token = token_;
        hook = hook_;
    }

    function buy(address token_, uint256 minTokensOut, address recipient)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        _validateToken(token_);
        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        return hook.buy{value: msg.value}(msg.sender, recipient, minTokensOut);
    }

    function sell(address token_, uint256 tokensIn, uint256 minOkbOut, address recipient)
        external
        nonReentrant
        returns (uint256 okbOut)
    {
        _validateToken(token_);
        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        if (!token.transferFrom(msg.sender, address(hook), tokensIn)) {
            revert TokenTransferFailed();
        }
        return hook.sell(msg.sender, recipient, tokensIn, minOkbOut);
    }

    function quoteBuy(address token_, uint256 okbIn) external view returns (BuyQuote memory) {
        _validateToken(token_);
        return hook.quoteBuy(okbIn);
    }

    function quoteSell(address token_, uint256 tokensIn) external view returns (SellQuote memory) {
        _validateToken(token_);
        return hook.quoteSell(tokensIn);
    }

    function _validateToken(address token_) internal view {
        if (token_ != address(token) || !factory.isToken(token_)) {
            revert InvalidToken();
        }
    }

    receive() external payable {
        revert InvalidToken();
    }
}
