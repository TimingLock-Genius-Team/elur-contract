// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {EulrHookRegistry} from "../../src/registry/EulrHookRegistry.sol";
import {EulrHookVerifierOperator} from "../../src/registry/EulrHookVerifierOperator.sol";
import {EulrHookVerifierRegistry} from "../../src/registry/EulrHookVerifierRegistry.sol";
import {IEulrHookRegistry} from "../../src/interfaces/IEulrHookRegistry.sol";

contract EulrHookVerifierOperatorTest is Test {
    uint160 internal constant BEFORE_AFTER_FLAGS = 0x00c0;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal submitter = makeAddr("submitter");
    address internal author = makeAddr("author");
    address internal creatorRecipient = makeAddr("creatorRecipient");
    address internal protocolRecipient = makeAddr("protocolRecipient");

    EulrHookRegistry internal registry;
    EulrHookVerifierRegistry internal verifierRegistry;
    EulrHookVerifierOperator internal operator;

    function setUp() public {
        verifierRegistry = new EulrHookVerifierRegistry(admin);
        operator = new EulrHookVerifierOperator(address(registry), address(verifierRegistry), admin);
        registry = new EulrHookRegistry(address(operator));
        vm.prank(admin);
        operator.bindRegistry(address(registry));

        vm.prank(admin);
        verifierRegistry.setVerifier(verifier, true);
    }

    function test_VerifierOperatorApprovesOnlyMatchingAcceptedReports() public {
        address hook = _hookWithFlags(BEFORE_AFTER_FLAGS);
        uint256 entryId = _submit(hook);

        EulrHookVerifierRegistry.VerificationRecord memory record = _record(hook);
        vm.prank(verifier);
        bytes32 recordId = verifierRegistry.publishVerification(record);
        assertTrue(verifierRegistry.isAccepted(recordId));

        vm.prank(admin);
        operator.markVerifiedAndSimulated(
            entryId,
            record.bytecodeHash,
            record.policyProfile,
            record.validationReportHash,
            "ipfs://validation",
            record.simulationReportHash,
            "ipfs://simulation"
        );

        IEulrHookRegistry.ApprovalConfig memory config = _approvalConfig();
        vm.prank(admin);
        operator.approveVerifiedHook(entryId, config, record.bytecodeHash, record.policyProfile);

        IEulrHookRegistry.HookEntry memory entry = registry.getHookEntry(entryId);
        assertEq(uint256(entry.status), uint256(IEulrHookRegistry.HookStatus.Approved));
        assertTrue(registry.isApprovedForDirectV4(entryId));
        assertTrue(registry.isApprovedForCurveFirst(entryId));
    }

    function test_VerifierOperatorRejectsMismatchedArtifactsAndUnauthorizedCallers() public {
        address hook = _hookWithFlags(BEFORE_AFTER_FLAGS);
        uint256 entryId = _submit(hook);
        EulrHookVerifierRegistry.VerificationRecord memory record = _record(hook);

        vm.expectRevert(EulrHookVerifierRegistry.OnlyVerifier.selector);
        verifierRegistry.publishVerification(record);

        vm.prank(verifier);
        verifierRegistry.publishVerification(record);

        vm.expectRevert(EulrHookVerifierOperator.OnlyAdmin.selector);
        operator.markVerifiedAndSimulated(
            entryId,
            record.bytecodeHash,
            record.policyProfile,
            record.validationReportHash,
            "ipfs://validation",
            record.simulationReportHash,
            "ipfs://simulation"
        );

        vm.prank(admin);
        vm.expectRevert(EulrHookVerifierOperator.UnverifiedHook.selector);
        operator.markVerifiedAndSimulated(
            entryId,
            keccak256("different-bytecode"),
            record.policyProfile,
            record.validationReportHash,
            "ipfs://validation",
            record.simulationReportHash,
            "ipfs://simulation"
        );
    }

    function _submit(address hook) internal returns (uint256 entryId) {
        vm.prank(submitter);
        entryId = registry.submitHook(
            IEulrHookRegistry.HookSubmission({
                hook: hook,
                author: author,
                targetChainId: block.chainid,
                permissionMask: BEFORE_AFTER_FLAGS,
                metadataURI: "ipfs://hook-metadata",
                metadataHash: keccak256("metadata"),
                sourceMetadataHash: keccak256("source"),
                artifactMetadataHash: keccak256("artifact"),
                constructorArgsHash: keccak256("constructor-args"),
                exampleHookDataHash: keccak256("hook-data"),
                recommendedPoolFee: 3_000,
                recommendedTickSpacing: 60,
                riskLabelMask: 0x0f
            })
        );
    }

    function _record(address hook) internal view returns (EulrHookVerifierRegistry.VerificationRecord memory record) {
        record = EulrHookVerifierRegistry.VerificationRecord({
            hook: hook,
            targetChainId: block.chainid,
            permissionMask: BEFORE_AFTER_FLAGS,
            sourceMetadataHash: keccak256("source"),
            artifactMetadataHash: keccak256("artifact"),
            constructorArgsHash: keccak256("constructor-args"),
            bytecodeHash: keccak256("bytecode"),
            validationReportHash: keccak256("validation"),
            simulationReportHash: keccak256("simulation"),
            policyProfile: keccak256("EULR_GENERATED_HOOK_V1"),
            reportURI: "ipfs://verification"
        });
    }

    function _approvalConfig() internal view returns (IEulrHookRegistry.ApprovalConfig memory config) {
        config = IEulrHookRegistry.ApprovalConfig({
            launchModes: registry.LAUNCH_MODE_CURVE_FIRST() | registry.LAUNCH_MODE_DIRECT_V4(),
            feeConfig: IEulrHookRegistry.TemplateFeeConfig({
                feeCurrency: address(0),
                oneTimeFee: 1 ether,
                creatorFeeRecipient: creatorRecipient,
                protocolFeeRecipient: protocolRecipient,
                protocolFeeBps: 1_000
            })
        });
    }

    function _hookWithFlags(uint160 flags) internal returns (address hook) {
        hook = address(uint160(0xBEEF) << 14 | flags);
        vm.etch(hook, hex"60016000526001601ff3");
    }
}
