// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Curve} from "../curve/Curve.sol";
import {CurveParams} from "../curve/CurveTypes.sol";
import {IEulrFactory} from "../interfaces/IEulrFactory.sol";
import {EulrHook} from "../hook/EulrHook.sol";
import {EulrRouter} from "../router/EulrRouter.sol";
import {EulrToken} from "../token/EulrToken.sol";

contract EulrFactory is IEulrFactory {
    uint256 public constant MAX_NAME_BYTES = 32;
    uint256 public constant MAX_SYMBOL_BYTES = 8;
    uint256 public constant MAX_METADATA_URI_BYTES = 512;
    uint256 public constant MAX_SOCIAL_URI_BYTES = 256;
    uint16 public constant DEFAULT_CURVE_S_OKB = 100;
    uint16 public constant MIN_CURVE_S_OKB = 1;
    uint16 public constant MAX_CURVE_S_OKB = 1000;

    address public immutable feeRecipient;
    address public immutable migrationTarget;

    address[] public allTokens;
    mapping(address token => TokenInfo info) private _tokenInfo;
    mapping(address token => bool registered) public isToken;

    error ZeroAddress();
    error MissingExternalCode(address target);
    error EmptyName();
    error EmptySymbol();
    error NameTooLong();
    error SymbolTooLong();
    error MetadataURITooLong();
    error SocialURITooLong();
    error InvalidCurveS();
    error UnknownToken();

    constructor(address feeRecipient_, address migrationTarget_) {
        if (feeRecipient_ == address(0) || migrationTarget_ == address(0)) {
            revert ZeroAddress();
        }
        if (migrationTarget_.code.length == 0) {
            revert MissingExternalCode(migrationTarget_);
        }

        feeRecipient = feeRecipient_;
        migrationTarget = migrationTarget_;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI
    ) external returns (address token, address hook, address router) {
        return _createToken(name, symbol, metadataURI, socialURI, DEFAULT_CURVE_S_OKB);
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS
    ) external returns (address token, address hook, address router) {
        return _createToken(name, symbol, metadataURI, socialURI, curveS);
    }

    function _createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS
    ) internal returns (address token, address hook, address router) {
        _validateTokenMetadata(name, symbol, metadataURI, socialURI);

        CurveParams memory params = _curveParamsForS(curveS);
        EulrToken tokenContract = new EulrToken(name, symbol, address(this));
        EulrHook hookContract = new EulrHook(tokenContract, feeRecipient, address(this), migrationTarget, params);
        EulrRouter routerContract = new EulrRouter(IEulrFactory(address(this)), tokenContract, hookContract);

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

        emit TokenCreated(token, hook, router, msg.sender, metadataURI, socialURI, curveS);
    }

    function _curveParamsForS(uint16 curveS) internal pure returns (CurveParams memory params) {
        if (curveS < MIN_CURVE_S_OKB || curveS > MAX_CURVE_S_OKB) {
            revert InvalidCurveS();
        }

        params = Curve.defaultParams();
        params.s = uint256(curveS) * 1e18;
    }

    function allTokensLength() external view returns (uint256) {
        return allTokens.length;
    }

    function getTokens(uint256 offset, uint256 limit) external view returns (address[] memory tokens) {
        uint256 tokenCount = allTokens.length;
        if (offset >= tokenCount || limit == 0) {
            return new address[](0);
        }

        uint256 remaining = tokenCount - offset;
        uint256 pageSize = limit < remaining ? limit : remaining;

        tokens = new address[](pageSize);
        for (uint256 i = 0; i < tokens.length; i++) {
            tokens[i] = allTokens[offset + i];
        }
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

    function _validateTokenMetadata(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI
    ) internal pure {
        bytes calldata nameBytes = bytes(name);
        bytes calldata symbolBytes = bytes(symbol);

        if (nameBytes.length == 0) {
            revert EmptyName();
        }
        if (symbolBytes.length == 0) {
            revert EmptySymbol();
        }
        if (nameBytes.length > MAX_NAME_BYTES) {
            revert NameTooLong();
        }
        if (symbolBytes.length > MAX_SYMBOL_BYTES) {
            revert SymbolTooLong();
        }
        if (bytes(metadataURI).length > MAX_METADATA_URI_BYTES) {
            revert MetadataURITooLong();
        }
        if (bytes(socialURI).length > MAX_SOCIAL_URI_BYTES) {
            revert SocialURITooLong();
        }
    }
}
