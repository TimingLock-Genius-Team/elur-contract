// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Curve} from "../curve/Curve.sol";
import {CurveParams} from "../curve/CurveTypes.sol";
import {ISatpadFactory} from "../interfaces/ISatpadFactory.sol";
import {SatpadHook} from "../hook/SatpadHook.sol";
import {SatpadRouter} from "../router/SatpadRouter.sol";
import {SatpadToken} from "../token/SatpadToken.sol";

contract SatpadFactory is ISatpadFactory {
    address public immutable feeRecipient;
    address public immutable uniswapV4PoolManager;
    address public immutable uniswapV4PositionManager;
    address public immutable migrationTarget;

    address[] public allTokens;
    mapping(address token => TokenInfo info) private _tokenInfo;
    mapping(address token => bool registered) public isToken;

    event TokenCreated(
        address indexed token,
        address indexed hook,
        address indexed router,
        address creator,
        string metadataURI,
        string socialURI
    );

    error ZeroAddress();
    error MissingExternalCode(address target);
    error EmptyName();
    error EmptySymbol();
    error NameTooLong();
    error SymbolTooLong();
    error UnknownToken();

    constructor(
        address feeRecipient_,
        address uniswapV4PoolManager_,
        address uniswapV4PositionManager_,
        address migrationTarget_
    ) {
        if (
            feeRecipient_ == address(0) || uniswapV4PoolManager_ == address(0)
                || uniswapV4PositionManager_ == address(0) || migrationTarget_ == address(0)
        ) {
            revert ZeroAddress();
        }
        if (uniswapV4PoolManager_.code.length == 0) {
            revert MissingExternalCode(uniswapV4PoolManager_);
        }
        if (uniswapV4PositionManager_.code.length == 0) {
            revert MissingExternalCode(uniswapV4PositionManager_);
        }
        if (migrationTarget_.code.length == 0) {
            revert MissingExternalCode(migrationTarget_);
        }

        feeRecipient = feeRecipient_;
        uniswapV4PoolManager = uniswapV4PoolManager_;
        uniswapV4PositionManager = uniswapV4PositionManager_;
        migrationTarget = migrationTarget_;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI
    ) external returns (address token, address hook, address router) {
        _validateTokenMetadata(name, symbol);

        CurveParams memory params = Curve.defaultParams();
        SatpadToken tokenContract = new SatpadToken(name, symbol, address(this));
        SatpadHook hookContract = new SatpadHook(tokenContract, feeRecipient, address(this), migrationTarget, params);
        SatpadRouter routerContract = new SatpadRouter(ISatpadFactory(address(this)), tokenContract, hookContract);

        tokenContract.setHook(address(hookContract));
        hookContract.setRouter(address(routerContract));

        token = address(tokenContract);
        hook = address(hookContract);
        router = address(routerContract);

        isToken[token] = true;
        allTokens.push(token);
        _tokenInfo[token] = TokenInfo({
            token: token,
            hook: hook,
            router: router,
            creator: msg.sender,
            metadataURI: metadataURI,
            socialURI: socialURI
        });

        emit TokenCreated(token, hook, router, msg.sender, metadataURI, socialURI);
    }

    function allTokensLength() external view returns (uint256) {
        return allTokens.length;
    }

    function getTokenInfo(address token) external view returns (TokenInfo memory) {
        if (!isToken[token]) {
            revert UnknownToken();
        }

        return _tokenInfo[token];
    }

    function curveParams() external pure returns (CurveParams memory) {
        return Curve.defaultParams();
    }

    function _validateTokenMetadata(string calldata name, string calldata symbol) internal pure {
        bytes calldata nameBytes = bytes(name);
        bytes calldata symbolBytes = bytes(symbol);

        if (nameBytes.length == 0) {
            revert EmptyName();
        }
        if (symbolBytes.length == 0) {
            revert EmptySymbol();
        }
        if (nameBytes.length > 32) {
            revert NameTooLong();
        }
        if (symbolBytes.length > 8) {
            revert SymbolTooLong();
        }
    }
}
