// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BuyQuote, CurveParams, SellQuote} from "../curve/CurveTypes.sol";
import {Curve} from "../curve/Curve.sol";
import {IMigrationTarget} from "../interfaces/IMigrationTarget.sol";
import {SatpadToken} from "../token/SatpadToken.sol";
import {NativeOkbTransfer} from "../libraries/NativeOkbTransfer.sol";
import {ReentrancyGuard} from "../libraries/ReentrancyGuard.sol";

contract SatpadHook is ReentrancyGuard {
    using NativeOkbTransfer for address;

    SatpadToken public immutable token;
    address public router;
    address public immutable feeRecipient;
    address public immutable factory;
    address public immutable migrationTarget;

    CurveParams public curveParams;
    uint256 public okbCum;
    uint256 public claimableFeeOkb;
    bool public selfDeprecated;
    bool public liquidityMigrated;

    mapping(address user => uint256 blockNumber) public lastBuyBlock;

    event Bought(
        address indexed token,
        address indexed user,
        address indexed recipient,
        uint256 grossOkbIn,
        uint256 fee,
        uint256 tokensOut,
        uint256 oldOkbCum,
        uint256 newOkbCum
    );
    event Sold(
        address indexed token,
        address indexed user,
        address indexed recipient,
        uint256 tokensIn,
        uint256 grossOkbOut,
        uint256 fee,
        uint256 netOkbOut,
        uint256 oldOkbCum,
        uint256 newOkbCum
    );
    event SelfDeprecated(address indexed token, uint256 okbCum, uint256 minted);
    event FeesClaimed(address indexed recipient, uint256 amount);
    event LiquidityMigrated(address indexed token, address indexed pool, uint256 okbAmount, uint256 tokenAmount);
    event LiquidityBurned(address indexed token, address indexed pool, uint256 liquidity);

    error OnlyFactory();
    error OnlyRouter();
    error OnlyFeeRecipient();
    error RouterAlreadySet();
    error ZeroAddress();
    error SlippageExceeded();
    error SelfDeprecatedBuyClosed();
    error SameBlockSell();
    error InsufficientReserve();
    error NotSelfDeprecated();
    error LiquidityAlreadyMigrated();
    error MigrationTargetMissing();
    error InvalidMigrationResult();
    error NoClaimableFees();
    error TokenTransferFailed();

    constructor(
        SatpadToken token_,
        address feeRecipient_,
        address factory_,
        address migrationTarget_,
        CurveParams memory curveParams_
    ) {
        if (
            address(token_) == address(0) || feeRecipient_ == address(0) || factory_ == address(0)
                || migrationTarget_ == address(0)
        ) {
            revert ZeroAddress();
        }

        Curve.validateParams(curveParams_);
        token = token_;
        feeRecipient = feeRecipient_;
        factory = factory_;
        migrationTarget = migrationTarget_;
        curveParams = curveParams_;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) {
            revert OnlyFactory();
        }
        _;
    }

    modifier onlyRouter() {
        if (msg.sender != router) {
            revert OnlyRouter();
        }
        _;
    }

    modifier onlyFeeRecipient() {
        if (msg.sender != feeRecipient) {
            revert OnlyFeeRecipient();
        }
        _;
    }

    function setRouter(address router_) external onlyFactory {
        if (router != address(0)) {
            revert RouterAlreadySet();
        }
        if (router_ == address(0)) {
            revert ZeroAddress();
        }

        router = router_;
    }

    function buy(address payer, address recipient, uint256 minTokensOut)
        external
        payable
        onlyRouter
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (recipient == address(0) || payer == address(0)) {
            revert ZeroAddress();
        }
        if (selfDeprecated) {
            revert SelfDeprecatedBuyClosed();
        }

        BuyQuote memory quote = Curve.quoteBuy(okbCum, msg.value, curveParams);
        if (quote.tokensOut < minTokensOut) {
            revert SlippageExceeded();
        }

        bool deprecatedAfterBuy = Curve.isSelfDeprecated(quote.newOkbCum, curveParams);

        okbCum = quote.newOkbCum;
        claimableFeeOkb += quote.fee;
        lastBuyBlock[payer] = block.number;
        lastBuyBlock[recipient] = block.number;
        if (deprecatedAfterBuy) {
            selfDeprecated = true;
        }

        token.mint(recipient, quote.tokensOut);

        if (deprecatedAfterBuy) {
            emit SelfDeprecated(address(token), quote.newOkbCum, quote.newMinted);
        }

        emit Bought(
            address(token),
            payer,
            recipient,
            quote.grossOkbIn,
            quote.fee,
            quote.tokensOut,
            quote.oldOkbCum,
            quote.newOkbCum
        );

        return quote.tokensOut;
    }

    function sell(address seller, address recipient, uint256 tokensIn, uint256 minOkbOut)
        external
        onlyRouter
        nonReentrant
        returns (uint256 okbOut)
    {
        if (recipient == address(0) || seller == address(0)) {
            revert ZeroAddress();
        }
        // slither-disable-next-line incorrect-equality
        if (lastBuyBlock[seller] == block.number) {
            revert SameBlockSell();
        }

        SellQuote memory quote = Curve.quoteSell(okbCum, tokensIn, curveParams);
        if (quote.netOkbOut < minOkbOut) {
            revert SlippageExceeded();
        }
        if (address(this).balance - claimableFeeOkb < quote.grossOkbOut) {
            revert InsufficientReserve();
        }

        okbCum = quote.newOkbCum;
        claimableFeeOkb += quote.fee;
        token.burn(address(this), tokensIn);

        recipient.safeTransfer(quote.netOkbOut);

        emit Sold(
            address(token),
            seller,
            recipient,
            tokensIn,
            quote.grossOkbOut,
            quote.fee,
            quote.netOkbOut,
            quote.oldOkbCum,
            quote.newOkbCum
        );

        return quote.netOkbOut;
    }

    function quoteBuy(uint256 okbIn) external view returns (BuyQuote memory) {
        return Curve.quoteBuy(okbCum, okbIn, curveParams);
    }

    function quoteSell(uint256 tokensIn) external view returns (SellQuote memory) {
        return Curve.quoteSell(okbCum, tokensIn, curveParams);
    }

    function getCurveParams() external view returns (CurveParams memory) {
        return curveParams;
    }

    function totalMinted() external view returns (uint256) {
        return Curve.totalMinted(okbCum, curveParams);
    }

    function currentPrice() external view returns (uint256) {
        return Curve.marginalPrice(okbCum, curveParams);
    }

    function claimFees(address recipient) external nonReentrant onlyFeeRecipient returns (uint256 amount) {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        amount = claimableFeeOkb;
        if (amount == 0) {
            revert NoClaimableFees();
        }

        claimableFeeOkb = 0;
        recipient.safeTransfer(amount);

        emit FeesClaimed(recipient, amount);
    }

    function migrateLiquidity(bytes calldata migrationData)
        external
        nonReentrant
        returns (address pool, uint256 liquidity)
    {
        if (!selfDeprecated) {
            revert NotSelfDeprecated();
        }
        if (liquidityMigrated) {
            revert LiquidityAlreadyMigrated();
        }
        if (migrationTarget.code.length == 0) {
            revert MigrationTargetMissing();
        }

        liquidityMigrated = true;

        uint256 okbAmount = address(this).balance - claimableFeeOkb;
        uint256 tokenAmount = curveParams.k > token.totalSupply() ? curveParams.k - token.totalSupply() : 0;
        if (tokenAmount > 0) {
            token.mint(address(this), tokenAmount);
            if (!token.transfer(migrationTarget, tokenAmount)) {
                revert TokenTransferFailed();
            }
        }

        // slither-disable-next-line arbitrary-send-eth
        (pool, liquidity) = IMigrationTarget(migrationTarget).migrate{value: okbAmount}(
            address(token), okbAmount, tokenAmount, migrationData
        );
        // slither-disable-next-line incorrect-equality
        if (pool == address(0) || liquidity == 0) {
            revert InvalidMigrationResult();
        }

        emit LiquidityMigrated(address(token), pool, okbAmount, tokenAmount);
        emit LiquidityBurned(address(token), pool, liquidity);
    }

    receive() external payable {}
}
