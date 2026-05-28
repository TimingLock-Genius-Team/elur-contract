// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IEulrHookRegistry} from "../interfaces/IEulrHookRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract EulrHookRegistry is IEulrHookRegistry, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint160 public constant HOOK_PERMISSION_MASK = (uint160(1) << 14) - 1;
    uint8 public constant LAUNCH_MODE_CURVE_FIRST = 1 << 0;
    uint8 public constant LAUNCH_MODE_DIRECT_V4 = 1 << 1;
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 10_000;

    address public immutable operator;
    uint256 public nextHookEntryId;

    mapping(uint256 entryId => HookEntry entry) private _entries;
    mapping(address collector => bool allowed) public feeCollectors;

    error ZeroAddress();
    error MissingHookCode(address hook);
    error InvalidTargetChain();
    error InvalidPermissionMask();
    error PermissionMaskMismatch();
    error InvalidPoolConfig();
    error UnknownHookEntry();
    error OnlyOperator();
    error InvalidStatusTransition();
    error InvalidLaunchModes();
    error InvalidFeeConfig();
    error IncorrectNativeFee();
    error UnauthorizedFeePayer();

    event HookSubmitted(
        uint256 indexed entryId,
        address indexed hook,
        address indexed submitter,
        address author,
        uint256 targetChainId,
        uint160 permissionMask,
        string metadataURI,
        bytes32 metadataHash
    );
    event HookValidated(uint256 indexed entryId, bytes32 indexed reportHash, string reportURI);
    event HookSimulated(uint256 indexed entryId, bytes32 indexed reportHash, string reportURI);
    event HookApproved(
        uint256 indexed entryId,
        uint8 launchModes,
        address feeCurrency,
        uint256 oneTimeFee,
        address creatorFeeRecipient,
        address protocolFeeRecipient,
        uint16 protocolFeeBps
    );
    event HookStatusChanged(uint256 indexed entryId, HookStatus indexed status, string reason);
    event FeeCollectorUpdated(address indexed collector, bool allowed);
    event HookTemplateFeePaid(
        uint256 indexed entryId,
        address indexed payer,
        address indexed feeCurrency,
        uint256 grossAmount,
        uint256 protocolAmount,
        uint256 creatorAmount
    );

    constructor(address operator_) {
        if (operator_ == address(0)) {
            revert ZeroAddress();
        }

        operator = operator_;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) {
            revert OnlyOperator();
        }
        _;
    }

    function submitHook(HookSubmission calldata submission) external returns (uint256 entryId) {
        _validateSubmission(submission);

        entryId = nextHookEntryId + 1;
        nextHookEntryId = entryId;

        HookEntry storage entry = _entries[entryId];
        entry.hook = submission.hook;
        entry.submitter = msg.sender;
        entry.author = submission.author;
        entry.targetChainId = submission.targetChainId;
        entry.permissionMask = submission.permissionMask;
        entry.status = HookStatus.Submitted;
        entry.metadataURI = submission.metadataURI;
        entry.metadataHash = submission.metadataHash;
        entry.sourceMetadataHash = submission.sourceMetadataHash;
        entry.artifactMetadataHash = submission.artifactMetadataHash;
        entry.constructorArgsHash = submission.constructorArgsHash;
        entry.exampleHookDataHash = submission.exampleHookDataHash;
        entry.recommendedPoolFee = submission.recommendedPoolFee;
        entry.recommendedTickSpacing = submission.recommendedTickSpacing;
        entry.riskLabelMask = submission.riskLabelMask;
        entry.submittedAt = block.timestamp;
        entry.statusUpdatedAt = block.timestamp;

        emit HookSubmitted(
            entryId,
            submission.hook,
            msg.sender,
            submission.author,
            submission.targetChainId,
            submission.permissionMask,
            submission.metadataURI,
            submission.metadataHash
        );
    }

    function markValidated(uint256 entryId, bytes32 reportHash, string calldata reportURI) external onlyOperator {
        HookEntry storage entry = _existingEntry(entryId);
        if (entry.status != HookStatus.Submitted) {
            revert InvalidStatusTransition();
        }

        entry.status = HookStatus.Validated;
        entry.validationReportHash = reportHash;
        entry.validationReportURI = reportURI;
        entry.validatedAt = block.timestamp;
        entry.statusUpdatedAt = block.timestamp;
        emit HookValidated(entryId, reportHash, reportURI);
        emit HookStatusChanged(entryId, HookStatus.Validated, "");
    }

    function markSimulated(uint256 entryId, bytes32 reportHash, string calldata reportURI) external onlyOperator {
        HookEntry storage entry = _existingEntry(entryId);
        if (entry.status != HookStatus.Validated) {
            revert InvalidStatusTransition();
        }

        entry.status = HookStatus.Simulated;
        entry.simulationReportHash = reportHash;
        entry.simulationReportURI = reportURI;
        entry.simulatedAt = block.timestamp;
        entry.statusUpdatedAt = block.timestamp;
        emit HookSimulated(entryId, reportHash, reportURI);
        emit HookStatusChanged(entryId, HookStatus.Simulated, "");
    }

    function approveHook(uint256 entryId, ApprovalConfig calldata config) external onlyOperator {
        HookEntry storage entry = _existingEntry(entryId);
        if (entry.status != HookStatus.Simulated) {
            revert InvalidStatusTransition();
        }
        _validateApprovalConfig(config);

        entry.status = HookStatus.Approved;
        entry.launchModes = config.launchModes;
        entry.feeConfig = config.feeConfig;
        entry.approvedAt = block.timestamp;
        entry.statusUpdatedAt = block.timestamp;

        emit HookApproved(
            entryId,
            config.launchModes,
            config.feeConfig.feeCurrency,
            config.feeConfig.oneTimeFee,
            config.feeConfig.creatorFeeRecipient,
            config.feeConfig.protocolFeeRecipient,
            config.feeConfig.protocolFeeBps
        );
        emit HookStatusChanged(entryId, HookStatus.Approved, "");
    }

    function setFeeCollector(address collector, bool allowed) external onlyOperator {
        if (collector == address(0)) {
            revert ZeroAddress();
        }

        feeCollectors[collector] = allowed;
        emit FeeCollectorUpdated(collector, allowed);
    }

    function suspendHook(uint256 entryId, string calldata reason) external onlyOperator {
        HookEntry storage entry = _existingEntry(entryId);
        if (entry.status != HookStatus.Approved) {
            revert InvalidStatusTransition();
        }

        _setTerminalOrPausedStatus(entry, entryId, HookStatus.Suspended, reason);
    }

    function deprecateHook(uint256 entryId, string calldata reason) external onlyOperator {
        HookEntry storage entry = _existingEntry(entryId);
        if (entry.status != HookStatus.Approved && entry.status != HookStatus.Suspended) {
            revert InvalidStatusTransition();
        }

        _setTerminalOrPausedStatus(entry, entryId, HookStatus.Deprecated, reason);
    }

    function rejectHook(uint256 entryId, string calldata reason) external onlyOperator {
        HookEntry storage entry = _existingEntry(entryId);
        if (
            entry.status != HookStatus.Submitted && entry.status != HookStatus.Validated
                && entry.status != HookStatus.Simulated
        ) {
            revert InvalidStatusTransition();
        }

        _setTerminalOrPausedStatus(entry, entryId, HookStatus.Rejected, reason);
    }

    function payTemplateFee(uint256 entryId, address payer)
        external
        payable
        nonReentrant
        returns (uint256 grossAmount, uint256 protocolAmount, uint256 creatorAmount)
    {
        HookEntry storage entry = _existingEntry(entryId);
        if (payer == address(0)) {
            revert ZeroAddress();
        }
        if (entry.status != HookStatus.Approved) {
            revert InvalidStatusTransition();
        }

        TemplateFeeConfig memory feeConfig = entry.feeConfig;
        grossAmount = feeConfig.oneTimeFee;
        if (grossAmount == 0) {
            if (msg.value != 0) {
                revert IncorrectNativeFee();
            }
            return (0, 0, 0);
        }

        protocolAmount = grossAmount * feeConfig.protocolFeeBps / 10_000;
        creatorAmount = grossAmount - protocolAmount;

        if (feeConfig.feeCurrency == address(0)) {
            if (msg.value != grossAmount) {
                revert IncorrectNativeFee();
            }
            _sendNative(feeConfig.protocolFeeRecipient, protocolAmount);
            _sendNative(feeConfig.creatorFeeRecipient, creatorAmount);
        } else {
            if (msg.value != 0) {
                revert IncorrectNativeFee();
            }
            if (payer != msg.sender && !feeCollectors[msg.sender]) {
                revert UnauthorizedFeePayer();
            }
            IERC20 token = IERC20(feeConfig.feeCurrency);
            if (protocolAmount != 0) {
                // slither-disable-next-line arbitrary-send-erc20
                token.safeTransferFrom(payer, feeConfig.protocolFeeRecipient, protocolAmount);
            }
            // slither-disable-next-line arbitrary-send-erc20
            token.safeTransferFrom(payer, feeConfig.creatorFeeRecipient, creatorAmount);
        }

        emit HookTemplateFeePaid(entryId, payer, feeConfig.feeCurrency, grossAmount, protocolAmount, creatorAmount);
    }

    function getHookEntry(uint256 entryId) external view returns (HookEntry memory entry) {
        entry = _existingEntryView(entryId);
    }

    function isApprovedForCurveFirst(uint256 entryId) external view returns (bool) {
        HookEntry storage entry = _entries[entryId];
        return entry.status == HookStatus.Approved && (entry.launchModes & LAUNCH_MODE_CURVE_FIRST) != 0;
    }

    function isApprovedForDirectV4(uint256 entryId) external view returns (bool) {
        HookEntry storage entry = _entries[entryId];
        return entry.status == HookStatus.Approved && (entry.launchModes & LAUNCH_MODE_DIRECT_V4) != 0;
    }

    function _validateSubmission(HookSubmission calldata submission) internal view {
        if (submission.hook == address(0) || submission.author == address(0)) {
            revert ZeroAddress();
        }
        if (submission.hook.code.length == 0) {
            revert MissingHookCode(submission.hook);
        }
        if (submission.targetChainId != block.chainid) {
            revert InvalidTargetChain();
        }
        if (submission.permissionMask == 0 || (submission.permissionMask & ~HOOK_PERMISSION_MASK) != 0) {
            revert InvalidPermissionMask();
        }
        if ((uint160(submission.hook) & HOOK_PERMISSION_MASK) != submission.permissionMask) {
            revert PermissionMaskMismatch();
        }
        if (submission.recommendedPoolFee == 0 || submission.recommendedTickSpacing <= 0) {
            revert InvalidPoolConfig();
        }
    }

    function _validateApprovalConfig(ApprovalConfig calldata config) internal pure {
        uint8 supportedModes = LAUNCH_MODE_CURVE_FIRST | LAUNCH_MODE_DIRECT_V4;
        if (config.launchModes == 0 || (config.launchModes & ~supportedModes) != 0) {
            revert InvalidLaunchModes();
        }

        TemplateFeeConfig calldata feeConfig = config.feeConfig;
        if (feeConfig.protocolFeeBps > MAX_PROTOCOL_FEE_BPS) {
            revert InvalidFeeConfig();
        }
        if (feeConfig.oneTimeFee != 0) {
            if (feeConfig.creatorFeeRecipient == address(0) || feeConfig.protocolFeeRecipient == address(0)) {
                revert InvalidFeeConfig();
            }
        }
    }

    function _existingEntry(uint256 entryId) internal view returns (HookEntry storage entry) {
        entry = _entries[entryId];
        if (entry.status == HookStatus.None) {
            revert UnknownHookEntry();
        }
    }

    function _existingEntryView(uint256 entryId) internal view returns (HookEntry storage entry) {
        entry = _existingEntry(entryId);
    }

    function _setTerminalOrPausedStatus(
        HookEntry storage entry,
        uint256 entryId,
        HookStatus status,
        string calldata reason
    ) internal {
        entry.status = status;
        entry.statusUpdatedAt = block.timestamp;
        emit HookStatusChanged(entryId, status, reason);
    }

    function _sendNative(address recipient, uint256 amount) internal {
        if (amount == 0) {
            return;
        }
        (bool success,) = recipient.call{value: amount}("");
        require(success, "native fee transfer failed");
    }
}
