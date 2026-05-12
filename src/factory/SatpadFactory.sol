// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Curve} from "../curve/Curve.sol";
import {CurveParams} from "../curve/CurveTypes.sol";
import {ISatpadFactory} from "../interfaces/ISatpadFactory.sol";
import {SatpadHook} from "../hook/SatpadHook.sol";
import {SatpadRouter} from "../router/SatpadRouter.sol";
import {SatpadToken} from "../token/SatpadToken.sol";

contract SatpadFactory is ISatpadFactory {
    uint256 public constant MAX_NAME_BYTES = 32;
    uint256 public constant MAX_SYMBOL_BYTES = 8;
    uint256 public constant MAX_METADATA_URI_BYTES = 512;
    uint256 public constant MAX_SOCIAL_URI_BYTES = 256;

    address public immutable feeRecipient;
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
    error MetadataURITooLong();
    error SocialURITooLong();
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
        _validateTokenMetadata(name, symbol, metadataURI, socialURI);

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
