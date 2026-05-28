// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Curve} from "../curve/Curve.sol";
import {CurveParams} from "../curve/CurveTypes.sol";
import {IEulrFactory} from "../interfaces/IEulrFactory.sol";
import {IEulrHookRegistry} from "../interfaces/IEulrHookRegistry.sol";
import {IEulrRouter} from "../interfaces/IEulrRouter.sol";
import {EulrHook} from "../hook/EulrHook.sol";
import {EulrRouter} from "../router/EulrRouter.sol";
import {EulrToken} from "../token/EulrToken.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

interface IV4MigrationTargetAllowlist {
    function expectedHooks() external view returns (address);
    function expectedPoolFee() external view returns (uint24);
    function expectedTickSpacing() external view returns (int24);
    function expectedTickLower() external view returns (int24);
    function expectedTickUpper() external view returns (int24);
    function expectedHookDataHash() external view returns (bytes32);
}

contract EulrFactory is IEulrFactory, Initializable {
    uint256 public constant MAX_NAME_BYTES = 32;
    uint256 public constant MAX_SYMBOL_BYTES = 8;
    uint256 public constant MAX_METADATA_URI_BYTES = 512;
    uint256 public constant MAX_SOCIAL_URI_BYTES = 256;
    uint16 public constant DEFAULT_CURVE_S_OKB = 100;
    uint16 public constant MIN_CURVE_S_OKB = 1;
    uint16 public constant MAX_CURVE_S_OKB = 1000;

    address public feeRecipient;
    address public migrationTarget;
    address public routerImplementation;
    address public routerProxyOwner;
    address public upgradeAdmin;
    address public hookImplementation;

    address[] public allTokens;
    mapping(address token => TokenInfo info) private _tokenInfo;
    mapping(address token => bool registered) public isToken;

    uint256 public nextV4MigrationProfileId;
    mapping(uint256 profileId => V4MigrationProfile profile) private _v4MigrationProfiles;
    mapping(address token => uint256 profileId) public tokenV4MigrationProfileId;
    address public hookRegistry;

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
    error OnlyUpgradeAdmin();
    error BuyAmountZero();
    error HookImplementationMissing();
    error InvalidV4MigrationProfile();
    error UnknownV4MigrationProfile();
    error InactiveV4MigrationProfile();

    event RouterImplementationUpdated(address indexed oldImplementation, address indexed newImplementation);
    event HookImplementationUpdated(address indexed oldImplementation, address indexed newImplementation);
    event HookRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address feeRecipient_,
        address migrationTarget_,
        address routerImplementation_,
        address routerProxyOwner_,
        address upgradeAdmin_
    ) external initializer {
        if (
            feeRecipient_ == address(0) || migrationTarget_ == address(0) || routerImplementation_ == address(0)
                || routerProxyOwner_ == address(0) || upgradeAdmin_ == address(0)
        ) {
            revert ZeroAddress();
        }
        if (migrationTarget_.code.length == 0) {
            revert MissingExternalCode(migrationTarget_);
        }
        if (routerImplementation_.code.length == 0) {
            revert MissingExternalCode(routerImplementation_);
        }

        feeRecipient = feeRecipient_;
        migrationTarget = migrationTarget_;
        routerImplementation = routerImplementation_;
        routerProxyOwner = routerProxyOwner_;
        upgradeAdmin = upgradeAdmin_;
    }

    modifier onlyUpgradeAdmin() {
        if (msg.sender != upgradeAdmin) {
            revert OnlyUpgradeAdmin();
        }
        _;
    }

    function setRouterImplementation(address newRouterImplementation) external onlyUpgradeAdmin {
        if (newRouterImplementation == address(0)) {
            revert ZeroAddress();
        }
        if (newRouterImplementation.code.length == 0) {
            revert MissingExternalCode(newRouterImplementation);
        }

        address oldImplementation = routerImplementation;
        routerImplementation = newRouterImplementation;
        emit RouterImplementationUpdated(oldImplementation, newRouterImplementation);
    }

    function setHookImplementation(address newHookImplementation) external onlyUpgradeAdmin {
        if (newHookImplementation == address(0)) {
            revert ZeroAddress();
        }
        if (newHookImplementation.code.length == 0) {
            revert MissingExternalCode(newHookImplementation);
        }

        address oldImplementation = hookImplementation;
        hookImplementation = newHookImplementation;
        emit HookImplementationUpdated(oldImplementation, newHookImplementation);
    }

    function setHookRegistry(address newHookRegistry) external onlyUpgradeAdmin {
        if (newHookRegistry == address(0)) {
            revert ZeroAddress();
        }
        if (newHookRegistry.code.length == 0) {
            revert MissingExternalCode(newHookRegistry);
        }

        address oldRegistry = hookRegistry;
        hookRegistry = newHookRegistry;
        emit HookRegistryUpdated(oldRegistry, newHookRegistry);
    }

    function registerV4MigrationProfile(V4MigrationProfile calldata profile)
        external
        onlyUpgradeAdmin
        returns (uint256 profileId)
    {
        _validateV4MigrationProfile(profile);

        profileId = nextV4MigrationProfileId + 1;
        nextV4MigrationProfileId = profileId;
        _v4MigrationProfiles[profileId] = profile;
    }

    function setV4MigrationProfileActive(uint256 profileId, bool active) external onlyUpgradeAdmin {
        V4MigrationProfile storage profile = _v4MigrationProfiles[profileId];
        if (profile.migrationTarget == address(0)) {
            revert UnknownV4MigrationProfile();
        }

        profile.active = active;
    }

    function getV4MigrationProfile(uint256 profileId) external view returns (V4MigrationProfile memory profile) {
        profile = _v4MigrationProfiles[profileId];
        if (profile.migrationTarget == address(0)) {
            revert UnknownV4MigrationProfile();
        }
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

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint16 feeBps,
        uint16 burnTaxMinBps,
        uint16 burnTaxMaxBps
    ) external returns (address token, address hook, address router) {
        CurveParams memory params = _curveParamsForS(curveS);
        params.feeBps = feeBps;
        params.burnTaxMinBps = burnTaxMinBps;
        params.burnTaxMaxBps = burnTaxMaxBps;
        return _createToken(name, symbol, metadataURI, socialURI, curveS, params);
    }

    function createTokenWithV4MigrationProfile(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint256 profileId
    ) external payable returns (address token, address hook, address router) {
        V4MigrationProfile memory profile = _activeV4MigrationProfile(profileId);
        _payTemplateFeeIfNeeded(profile, msg.sender, msg.value, true);
        (token, hook, router) = _createToken(
            name, symbol, metadataURI, socialURI, curveS, _curveParamsForS(curveS), profile.migrationTarget
        );
        tokenV4MigrationProfileId[token] = profileId;
        emit TokenV4MigrationProfileBound(token, profileId, profile.hooks, profile.migrationTarget);
    }

    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint256 minTokensOut,
        address recipient
    ) external payable returns (address token, address hook, address router) {
        return _createTokenAndBuy(name, symbol, metadataURI, socialURI, DEFAULT_CURVE_S_OKB, minTokensOut, recipient);
    }

    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint256 minTokensOut,
        address recipient
    ) external payable returns (address token, address hook, address router) {
        return _createTokenAndBuy(name, symbol, metadataURI, socialURI, curveS, minTokensOut, recipient);
    }

    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint16 feeBps,
        uint16 burnTaxMinBps,
        uint16 burnTaxMaxBps,
        uint256 minTokensOut,
        address recipient
    ) external payable returns (address token, address hook, address router) {
        CurveParams memory params = _curveParamsForS(curveS);
        params.feeBps = feeBps;
        params.burnTaxMinBps = burnTaxMinBps;
        params.burnTaxMaxBps = burnTaxMaxBps;
        return _createTokenAndBuy(name, symbol, metadataURI, socialURI, curveS, params, minTokensOut, recipient);
    }

    function createTokenAndBuyWithV4MigrationProfile(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint256 profileId,
        uint256 minTokensOut,
        address recipient
    ) external payable returns (address token, address hook, address router) {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        V4MigrationProfile memory profile = _activeV4MigrationProfile(profileId);
        uint256 nativeTemplateFee = _payTemplateFeeIfNeeded(profile, msg.sender, msg.value, false);
        uint256 buyValue = msg.value - nativeTemplateFee;
        if (buyValue == 0) {
            revert BuyAmountZero();
        }
        (token, hook, router) = _createToken(
            name, symbol, metadataURI, socialURI, curveS, _curveParamsForS(curveS), profile.migrationTarget
        );
        tokenV4MigrationProfileId[token] = profileId;
        emit TokenV4MigrationProfileBound(token, profileId, profile.hooks, profile.migrationTarget);

        uint256 tokensOut = IEulrRouter(router).buyFor{value: buyValue}(msg.sender, token, minTokensOut, recipient);
        tokensOut;
    }

    function _createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        uint256 minTokensOut,
        address recipient
    ) internal returns (address token, address hook, address router) {
        return _createTokenAndBuy(
            name, symbol, metadataURI, socialURI, curveS, _curveParamsForS(curveS), minTokensOut, recipient
        );
    }

    function _createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        CurveParams memory params,
        uint256 minTokensOut,
        address recipient
    ) internal returns (address token, address hook, address router) {
        if (msg.value == 0) {
            revert BuyAmountZero();
        }
        if (recipient == address(0)) {
            revert ZeroAddress();
        }
        (address tokenAddr, address hookAddr, address routerAddr) =
            _createToken(name, symbol, metadataURI, socialURI, curveS, params);
        uint256 tokensOut =
            IEulrRouter(routerAddr).buyFor{value: msg.value}(msg.sender, tokenAddr, minTokensOut, recipient);
        tokensOut;
        return (tokenAddr, hookAddr, routerAddr);
    }

    function _createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS
    ) internal returns (address token, address hook, address router) {
        CurveParams memory params = _curveParamsForS(curveS);
        return _createToken(name, symbol, metadataURI, socialURI, curveS, params);
    }

    function _createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        CurveParams memory params
    ) internal returns (address token, address hook, address router) {
        return _createToken(name, symbol, metadataURI, socialURI, curveS, params, migrationTarget);
    }

    function _createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        string calldata socialURI,
        uint16 curveS,
        CurveParams memory params,
        address migrationTarget_
    ) internal returns (address token, address hook, address router) {
        _validateTokenMetadata(name, symbol, metadataURI, socialURI);

        if (hookImplementation == address(0)) {
            revert HookImplementationMissing();
        }

        EulrToken tokenContract = new EulrToken(name, symbol, address(this));
        TransparentUpgradeableProxy hookProxy = new TransparentUpgradeableProxy(
            hookImplementation,
            routerProxyOwner,
            abi.encodeCall(EulrHook.initialize, (tokenContract, feeRecipient, address(this), migrationTarget_, params))
        );
        EulrHook hookContract = EulrHook(payable(address(hookProxy)));
        TransparentUpgradeableProxy routerProxy = new TransparentUpgradeableProxy(
            routerImplementation,
            routerProxyOwner,
            abi.encodeCall(EulrRouter.initialize, (IEulrFactory(address(this)), tokenContract, hookContract))
        );

        tokenContract.setHook(address(hookContract));
        hookContract.setRouter(address(routerProxy));

        token = address(tokenContract);
        hook = address(hookContract);
        router = address(routerProxy);

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

    function _activeV4MigrationProfile(uint256 profileId) internal view returns (V4MigrationProfile memory profile) {
        profile = _v4MigrationProfiles[profileId];
        if (profile.migrationTarget == address(0)) {
            revert UnknownV4MigrationProfile();
        }
        if (!profile.active) {
            revert InactiveV4MigrationProfile();
        }
        if (profile.hookRegistryEntryId != 0 && !_isRegistryEntryApprovedForCurveFirst(profile.hookRegistryEntryId)) {
            revert InactiveV4MigrationProfile();
        }
    }

    function _validateV4MigrationProfile(V4MigrationProfile calldata profile) internal view {
        if (
            profile.migrationTarget == address(0) || profile.hooks == address(0) || profile.poolFee == 0
                || profile.tickSpacing <= 0 || profile.tickLower >= profile.tickUpper
                || profile.tickLower % profile.tickSpacing != 0 || profile.tickUpper % profile.tickSpacing != 0
        ) {
            revert InvalidV4MigrationProfile();
        }
        if (profile.migrationTarget.code.length == 0) {
            revert MissingExternalCode(profile.migrationTarget);
        }
        if (profile.hookRegistryEntryId != 0) {
            _validateRegistryBackedProfile(profile);
        }
        _validateMigrationTargetAllowlistIfPresent(profile);
    }

    function _validateRegistryBackedProfile(V4MigrationProfile calldata profile) internal view {
        if (hookRegistry == address(0)) {
            revert InvalidV4MigrationProfile();
        }

        IEulrHookRegistry.HookEntry memory entry =
            IEulrHookRegistry(hookRegistry).getHookEntry(profile.hookRegistryEntryId);
        if (
            entry.hook != profile.hooks || entry.targetChainId != block.chainid
                || !IEulrHookRegistry(hookRegistry).isApprovedForCurveFirst(profile.hookRegistryEntryId)
        ) {
            revert InvalidV4MigrationProfile();
        }
    }

    function _isRegistryEntryApprovedForCurveFirst(uint256 hookRegistryEntryId) internal view returns (bool) {
        return
            hookRegistry != address(0) && IEulrHookRegistry(hookRegistry).isApprovedForCurveFirst(hookRegistryEntryId);
    }

    function _validateMigrationTargetAllowlistIfPresent(V4MigrationProfile calldata profile) internal view {
        IV4MigrationTargetAllowlist target = IV4MigrationTargetAllowlist(profile.migrationTarget);
        try target.expectedHooks() returns (address expectedHooks) {
            if (
                expectedHooks != profile.hooks || target.expectedPoolFee() != profile.poolFee
                    || target.expectedTickSpacing() != profile.tickSpacing
                    || target.expectedTickLower() != profile.tickLower
                    || target.expectedTickUpper() != profile.tickUpper
                    || target.expectedHookDataHash() != profile.hookDataHash
            ) {
                revert InvalidV4MigrationProfile();
            }
        } catch {
            return;
        }
    }

    function _payTemplateFeeIfNeeded(
        V4MigrationProfile memory profile,
        address payer,
        uint256 nativeValue,
        bool exactNativeValue
    ) internal returns (uint256 nativeTemplateFee) {
        if (profile.hookRegistryEntryId == 0) {
            if (exactNativeValue && nativeValue != 0) {
                revert InvalidV4MigrationProfile();
            }
            return 0;
        }

        IEulrHookRegistry.HookEntry memory entry =
            IEulrHookRegistry(hookRegistry).getHookEntry(profile.hookRegistryEntryId);
        IEulrHookRegistry.TemplateFeeConfig memory feeConfig = entry.feeConfig;
        if (feeConfig.oneTimeFee == 0) {
            if (exactNativeValue && nativeValue != 0) {
                revert InvalidV4MigrationProfile();
            }
            return 0;
        }

        if (feeConfig.feeCurrency == address(0)) {
            nativeTemplateFee = feeConfig.oneTimeFee;
            if (nativeValue < nativeTemplateFee || (exactNativeValue && nativeValue != nativeTemplateFee)) {
                revert InvalidV4MigrationProfile();
            }
            // slither-disable-next-line arbitrary-send-eth
            (uint256 nativeGrossAmount, uint256 nativeProtocolAmount, uint256 nativeCreatorAmount) = IEulrHookRegistry(
                hookRegistry
            )
            .payTemplateFee{value: nativeTemplateFee}(
                profile.hookRegistryEntryId, payer
            );
            nativeGrossAmount;
            nativeProtocolAmount;
            nativeCreatorAmount;
            return nativeTemplateFee;
        }

        if (exactNativeValue && nativeValue != 0) {
            revert InvalidV4MigrationProfile();
        }
        (uint256 tokenGrossAmount, uint256 tokenProtocolAmount, uint256 tokenCreatorAmount) =
            IEulrHookRegistry(hookRegistry).payTemplateFee(profile.hookRegistryEntryId, payer);
        tokenGrossAmount;
        tokenProtocolAmount;
        tokenCreatorAmount;
        return 0;
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
