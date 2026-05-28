// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract EulrHookVerifierRegistry {
    struct VerificationRecord {
        address hook;
        uint256 targetChainId;
        uint160 permissionMask;
        bytes32 sourceMetadataHash;
        bytes32 artifactMetadataHash;
        bytes32 constructorArgsHash;
        bytes32 bytecodeHash;
        bytes32 validationReportHash;
        bytes32 simulationReportHash;
        bytes32 policyProfile;
        string reportURI;
    }

    struct StoredVerificationRecord {
        VerificationRecord record;
        address verifier;
        uint256 acceptedAt;
        bool revoked;
    }

    address public immutable admin;
    mapping(address verifier => bool allowed) public verifiers;
    mapping(bytes32 recordId => StoredVerificationRecord record) private _records;

    error ZeroAddress();
    error OnlyAdmin();
    error OnlyVerifier();
    error InvalidVerificationRecord();

    event VerifierUpdated(address indexed verifier, bool allowed);
    event VerificationPublished(bytes32 indexed recordId, address indexed hook, address indexed verifier);
    event VerificationRevoked(bytes32 indexed recordId);

    constructor(address admin_) {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyVerifier() {
        if (!verifiers[msg.sender]) revert OnlyVerifier();
        _;
    }

    function setVerifier(address verifier, bool allowed) external onlyAdmin {
        if (verifier == address(0)) revert ZeroAddress();
        verifiers[verifier] = allowed;
        emit VerifierUpdated(verifier, allowed);
    }

    function publishVerification(VerificationRecord calldata record) external onlyVerifier returns (bytes32 recordId) {
        _validateRecord(record);
        recordId = recordIdFor(record);
        _records[recordId] =
            StoredVerificationRecord({record: record, verifier: msg.sender, acceptedAt: block.timestamp, revoked: false});
        emit VerificationPublished(recordId, record.hook, msg.sender);
    }

    function revokeVerification(bytes32 recordId) external onlyAdmin {
        StoredVerificationRecord storage stored = _records[recordId];
        if (stored.acceptedAt == 0 || stored.revoked) revert InvalidVerificationRecord();
        stored.revoked = true;
        emit VerificationRevoked(recordId);
    }

    function getVerification(bytes32 recordId) external view returns (StoredVerificationRecord memory record) {
        record = _records[recordId];
    }

    function isAccepted(bytes32 recordId) external view returns (bool) {
        StoredVerificationRecord storage stored = _records[recordId];
        return stored.acceptedAt != 0 && !stored.revoked;
    }

    function isProductionVerified(VerificationRecord calldata record) external view returns (bool) {
        bytes32 recordId = recordIdFor(record);
        StoredVerificationRecord storage stored = _records[recordId];
        return stored.acceptedAt != 0 && !stored.revoked;
    }

    function recordIdFor(VerificationRecord memory record) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                record.hook,
                record.targetChainId,
                record.permissionMask,
                record.sourceMetadataHash,
                record.artifactMetadataHash,
                record.constructorArgsHash,
                record.bytecodeHash,
                record.validationReportHash,
                record.simulationReportHash,
                record.policyProfile
            )
        );
    }

    function _validateRecord(VerificationRecord calldata record) private pure {
        if (record.hook == address(0)) revert ZeroAddress();
        if (record.targetChainId == 0 || record.permissionMask == 0 || record.permissionMask >= 1 << 14) {
            revert InvalidVerificationRecord();
        }
        if (
            record.sourceMetadataHash == bytes32(0) || record.artifactMetadataHash == bytes32(0)
                || record.constructorArgsHash == bytes32(0) || record.bytecodeHash == bytes32(0)
                || record.validationReportHash == bytes32(0) || record.simulationReportHash == bytes32(0)
                || record.policyProfile == bytes32(0)
        ) {
            revert InvalidVerificationRecord();
        }
    }
}
