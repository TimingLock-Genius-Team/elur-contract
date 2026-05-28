// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IEulrHookRegistry {
    enum HookStatus {
        None,
        Submitted,
        Validated,
        Simulated,
        Approved,
        Suspended,
        Deprecated,
        Rejected
    }

    struct TemplateFeeConfig {
        address feeCurrency;
        uint256 oneTimeFee;
        address creatorFeeRecipient;
        address protocolFeeRecipient;
        uint16 protocolFeeBps;
    }

    struct HookSubmission {
        address hook;
        address author;
        uint256 targetChainId;
        uint160 permissionMask;
        string metadataURI;
        bytes32 metadataHash;
        bytes32 sourceMetadataHash;
        bytes32 artifactMetadataHash;
        bytes32 constructorArgsHash;
        bytes32 exampleHookDataHash;
        uint24 recommendedPoolFee;
        int24 recommendedTickSpacing;
        uint256 riskLabelMask;
    }

    struct ApprovalConfig {
        uint8 launchModes;
        TemplateFeeConfig feeConfig;
    }

    struct HookEntry {
        address hook;
        address submitter;
        address author;
        uint256 targetChainId;
        uint160 permissionMask;
        HookStatus status;
        string metadataURI;
        bytes32 metadataHash;
        bytes32 sourceMetadataHash;
        bytes32 artifactMetadataHash;
        bytes32 constructorArgsHash;
        bytes32 exampleHookDataHash;
        uint24 recommendedPoolFee;
        int24 recommendedTickSpacing;
        uint256 riskLabelMask;
        bytes32 validationReportHash;
        string validationReportURI;
        bytes32 simulationReportHash;
        string simulationReportURI;
        uint8 launchModes;
        TemplateFeeConfig feeConfig;
        uint256 submittedAt;
        uint256 validatedAt;
        uint256 simulatedAt;
        uint256 approvedAt;
        uint256 statusUpdatedAt;
    }

    function submitHook(HookSubmission calldata submission) external returns (uint256 entryId);
    function markValidated(uint256 entryId, bytes32 reportHash, string calldata reportURI) external;
    function markSimulated(uint256 entryId, bytes32 reportHash, string calldata reportURI) external;
    function approveHook(uint256 entryId, ApprovalConfig calldata config) external;
    function setFeeCollector(address collector, bool allowed) external;
    function suspendHook(uint256 entryId, string calldata reason) external;
    function deprecateHook(uint256 entryId, string calldata reason) external;
    function rejectHook(uint256 entryId, string calldata reason) external;
    function payTemplateFee(uint256 entryId, address payer)
        external
        payable
        returns (uint256 grossAmount, uint256 protocolAmount, uint256 creatorAmount);
    function getHookEntry(uint256 entryId) external view returns (HookEntry memory entry);
    function isApprovedForCurveFirst(uint256 entryId) external view returns (bool);
    function isApprovedForDirectV4(uint256 entryId) external view returns (bool);
}
