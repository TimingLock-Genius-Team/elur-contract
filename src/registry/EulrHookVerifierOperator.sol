// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IEulrHookRegistry} from "../interfaces/IEulrHookRegistry.sol";
import {EulrHookVerifierRegistry} from "./EulrHookVerifierRegistry.sol";

contract EulrHookVerifierOperator {
    address public immutable admin;
    EulrHookVerifierRegistry public immutable verifierRegistry;
    IEulrHookRegistry public registry;

    error ZeroAddress();
    error OnlyAdmin();
    error RegistryAlreadyBound();
    error RegistryNotBound();
    error UnverifiedHook();

    event RegistryBound(address indexed registry);

    constructor(address registry_, address verifierRegistry_, address admin_) {
        if (verifierRegistry_ == address(0) || admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
        verifierRegistry = EulrHookVerifierRegistry(verifierRegistry_);
        if (registry_ != address(0)) {
            registry = IEulrHookRegistry(registry_);
            emit RegistryBound(registry_);
        }
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    function bindRegistry(address registry_) external onlyAdmin {
        if (registry_ == address(0)) revert ZeroAddress();
        if (address(registry) != address(0)) revert RegistryAlreadyBound();
        registry = IEulrHookRegistry(registry_);
        emit RegistryBound(registry_);
    }

    function markVerifiedAndSimulated(
        uint256 entryId,
        bytes32 bytecodeHash,
        bytes32 policyProfile,
        bytes32 validationReportHash,
        string calldata validationReportURI,
        bytes32 simulationReportHash,
        string calldata simulationReportURI
    ) external onlyAdmin {
        IEulrHookRegistry registry_ = _registry();
        IEulrHookRegistry.HookEntry memory entry = registry_.getHookEntry(entryId);
        _requireVerified(entry, bytecodeHash, policyProfile, validationReportHash, simulationReportHash);

        registry_.markValidated(entryId, validationReportHash, validationReportURI);
        registry_.markSimulated(entryId, simulationReportHash, simulationReportURI);
    }

    function approveVerifiedHook(
        uint256 entryId,
        IEulrHookRegistry.ApprovalConfig calldata config,
        bytes32 bytecodeHash,
        bytes32 policyProfile
    ) external onlyAdmin {
        IEulrHookRegistry registry_ = _registry();
        IEulrHookRegistry.HookEntry memory entry = registry_.getHookEntry(entryId);
        _requireVerified(entry, bytecodeHash, policyProfile, entry.validationReportHash, entry.simulationReportHash);
        registry_.approveHook(entryId, config);
    }

    function _registry() private view returns (IEulrHookRegistry registry_) {
        registry_ = registry;
        if (address(registry_) == address(0)) revert RegistryNotBound();
    }

    function _requireVerified(
        IEulrHookRegistry.HookEntry memory entry,
        bytes32 bytecodeHash,
        bytes32 policyProfile,
        bytes32 validationReportHash,
        bytes32 simulationReportHash
    ) private view {
        EulrHookVerifierRegistry.VerificationRecord memory record = EulrHookVerifierRegistry.VerificationRecord({
            hook: entry.hook,
            targetChainId: entry.targetChainId,
            permissionMask: entry.permissionMask,
            sourceMetadataHash: entry.sourceMetadataHash,
            artifactMetadataHash: entry.artifactMetadataHash,
            constructorArgsHash: entry.constructorArgsHash,
            bytecodeHash: bytecodeHash,
            validationReportHash: validationReportHash,
            simulationReportHash: simulationReportHash,
            policyProfile: policyProfile,
            reportURI: ""
        });
        if (!verifierRegistry.isProductionVerified(record)) revert UnverifiedHook();
    }
}
