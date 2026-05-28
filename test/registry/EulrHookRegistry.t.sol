// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {EulrHookRegistry} from "../../src/registry/EulrHookRegistry.sol";
import {IEulrHookRegistry} from "../../src/interfaces/IEulrHookRegistry.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockTemplateFeeToken is ERC20 {
    constructor() ERC20("Template Fee", "TFEE") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract RejectNativeFeeRecipient {
    receive() external payable {
        revert("reject native");
    }
}

contract EulrHookRegistryTest is Test {
    EulrHookRegistry internal registry;

    address internal operator = makeAddr("operator");
    address internal submitter = makeAddr("submitter");
    address internal author = makeAddr("author");
    address internal creatorRecipient = makeAddr("creatorRecipient");
    address internal protocolRecipient = makeAddr("protocolRecipient");

    uint160 internal constant BEFORE_AFTER_FLAGS = 0x00c0;

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
    event HookStatusChanged(uint256 indexed entryId, IEulrHookRegistry.HookStatus indexed status, string reason);
    event HookTemplateFeePaid(
        uint256 indexed entryId,
        address indexed payer,
        address indexed feeCurrency,
        uint256 grossAmount,
        uint256 protocolAmount,
        uint256 creatorAmount
    );

    function setUp() public {
        registry = new EulrHookRegistry(operator);
    }

    function test_ConstructorRejectsZeroOperator() public {
        vm.expectRevert(EulrHookRegistry.ZeroAddress.selector);
        new EulrHookRegistry(address(0));
    }

    function test_SubmitHookStoresMetadataAndRequiresPermissionMaskMatch() public {
        address hook = _hookWithFlags(BEFORE_AFTER_FLAGS);
        IEulrHookRegistry.HookSubmission memory submission = _submission(hook);

        vm.expectEmit(true, true, true, true);
        emit HookSubmitted(
            1, hook, submitter, author, block.chainid, BEFORE_AFTER_FLAGS, "ipfs://hook-metadata", keccak256("metadata")
        );

        vm.prank(submitter);
        uint256 entryId = registry.submitHook(submission);

        IEulrHookRegistry.HookEntry memory entry = registry.getHookEntry(entryId);
        assertEq(entryId, 1);
        assertEq(registry.nextHookEntryId(), 1);
        assertEq(entry.hook, hook);
        assertEq(entry.submitter, submitter);
        assertEq(entry.author, author);
        assertEq(entry.targetChainId, block.chainid);
        assertEq(entry.permissionMask, BEFORE_AFTER_FLAGS);
        assertEq(uint256(entry.status), uint256(IEulrHookRegistry.HookStatus.Submitted));
        assertEq(entry.metadataURI, "ipfs://hook-metadata");
        assertEq(entry.metadataHash, keccak256("metadata"));
        assertEq(entry.recommendedPoolFee, 3_000);
        assertEq(entry.recommendedTickSpacing, 60);

        submission.permissionMask = 0x0040;
        vm.prank(submitter);
        vm.expectRevert(EulrHookRegistry.PermissionMaskMismatch.selector);
        registry.submitHook(submission);
    }

    function test_SubmitHookRejectsInvalidMetadataAndPoolConfig() public {
        address hook = _hookWithFlags(BEFORE_AFTER_FLAGS);
        IEulrHookRegistry.HookSubmission memory submission = _submission(hook);

        submission.author = address(0);
        vm.prank(submitter);
        vm.expectRevert(EulrHookRegistry.ZeroAddress.selector);
        registry.submitHook(submission);

        address noCodeHook = makeAddr("noCodeHook");
        submission = _submission(noCodeHook);
        vm.prank(submitter);
        vm.expectRevert(abi.encodeWithSelector(EulrHookRegistry.MissingHookCode.selector, noCodeHook));
        registry.submitHook(submission);

        submission = _submission(hook);
        submission.targetChainId = block.chainid + 1;
        vm.prank(submitter);
        vm.expectRevert(EulrHookRegistry.InvalidTargetChain.selector);
        registry.submitHook(submission);

        submission = _submission(hook);
        submission.permissionMask = 0;
        vm.prank(submitter);
        vm.expectRevert(EulrHookRegistry.InvalidPermissionMask.selector);
        registry.submitHook(submission);

        submission = _submission(hook);
        submission.recommendedTickSpacing = 0;
        vm.prank(submitter);
        vm.expectRevert(EulrHookRegistry.InvalidPoolConfig.selector);
        registry.submitHook(submission);
    }

    function test_OperatorLifecycleApprovesAndSuspendsLaunchEligibility() public {
        uint256 entryId = _submitDefaultHook();

        vm.expectRevert(EulrHookRegistry.OnlyOperator.selector);
        vm.prank(submitter);
        registry.markValidated(entryId, keccak256("validation"), "ipfs://validation");

        vm.expectEmit(true, true, false, true);
        emit HookValidated(entryId, keccak256("validation"), "ipfs://validation");
        vm.prank(operator);
        registry.markValidated(entryId, keccak256("validation"), "ipfs://validation");

        vm.expectEmit(true, true, false, true);
        emit HookSimulated(entryId, keccak256("simulation"), "ipfs://simulation");
        vm.prank(operator);
        registry.markSimulated(entryId, keccak256("simulation"), "ipfs://simulation");

        IEulrHookRegistry.ApprovalConfig memory approvalConfig = _approvalConfig();
        vm.expectEmit(true, false, false, true);
        emit HookApproved(
            entryId,
            approvalConfig.launchModes,
            approvalConfig.feeConfig.feeCurrency,
            approvalConfig.feeConfig.oneTimeFee,
            approvalConfig.feeConfig.creatorFeeRecipient,
            approvalConfig.feeConfig.protocolFeeRecipient,
            approvalConfig.feeConfig.protocolFeeBps
        );
        vm.prank(operator);
        registry.approveHook(entryId, approvalConfig);

        assertTrue(registry.isApprovedForCurveFirst(entryId));
        assertTrue(registry.isApprovedForDirectV4(entryId));

        vm.expectEmit(true, true, false, true);
        emit HookStatusChanged(entryId, IEulrHookRegistry.HookStatus.Suspended, "operator pause");
        vm.prank(operator);
        registry.suspendHook(entryId, "operator pause");

        assertFalse(registry.isApprovedForCurveFirst(entryId));
        assertFalse(registry.isApprovedForDirectV4(entryId));
    }

    function test_OperatorLifecycleRejectsInvalidStatusMovesAndSupportsTerminalStatuses() public {
        uint256 entryId = _submitDefaultHook();

        vm.prank(operator);
        vm.expectRevert(EulrHookRegistry.InvalidStatusTransition.selector);
        registry.markSimulated(entryId, keccak256("simulation"), "ipfs://simulation");

        vm.startPrank(operator);
        registry.markValidated(entryId, keccak256("validation"), "ipfs://validation");
        registry.markSimulated(entryId, keccak256("simulation"), "ipfs://simulation");

        IEulrHookRegistry.ApprovalConfig memory invalidConfig = _approvalConfig();
        invalidConfig.launchModes = 0;
        vm.expectRevert(EulrHookRegistry.InvalidLaunchModes.selector);
        registry.approveHook(entryId, invalidConfig);

        invalidConfig = _approvalConfig();
        invalidConfig.feeConfig.protocolFeeBps = 10_001;
        vm.expectRevert(EulrHookRegistry.InvalidFeeConfig.selector);
        registry.approveHook(entryId, invalidConfig);

        invalidConfig = _approvalConfig();
        invalidConfig.feeConfig.creatorFeeRecipient = address(0);
        vm.expectRevert(EulrHookRegistry.InvalidFeeConfig.selector);
        registry.approveHook(entryId, invalidConfig);

        registry.approveHook(entryId, _approvalConfig());
        registry.deprecateHook(entryId, "old template");
        vm.expectRevert(EulrHookRegistry.InvalidStatusTransition.selector);
        registry.rejectHook(entryId, "too late");
        vm.stopPrank();

        uint256 rejectedEntryId = _submitDefaultHook();
        vm.prank(operator);
        registry.rejectHook(rejectedEntryId, "bad report");
        IEulrHookRegistry.HookEntry memory rejectedEntry = registry.getHookEntry(rejectedEntryId);
        assertEq(uint256(rejectedEntry.status), uint256(IEulrHookRegistry.HookStatus.Rejected));
    }

    function test_ApproveFreezesTemplateFeeConfigAndRejectsInvalidTransitions() public {
        uint256 entryId = _submitDefaultHook();
        IEulrHookRegistry.ApprovalConfig memory config = _approvalConfig();

        vm.expectRevert(EulrHookRegistry.InvalidStatusTransition.selector);
        vm.prank(operator);
        registry.approveHook(entryId, config);

        vm.prank(operator);
        registry.markValidated(entryId, keccak256("validation"), "ipfs://validation");
        vm.prank(operator);
        registry.markSimulated(entryId, keccak256("simulation"), "ipfs://simulation");
        vm.prank(operator);
        registry.approveHook(entryId, config);

        IEulrHookRegistry.HookEntry memory entry = registry.getHookEntry(entryId);
        assertEq(entry.approvedAt, block.timestamp);
        assertEq(entry.feeConfig.oneTimeFee, 1 ether);
        assertEq(entry.feeConfig.creatorFeeRecipient, creatorRecipient);
        assertEq(entry.feeConfig.protocolFeeRecipient, protocolRecipient);
        assertEq(entry.feeConfig.protocolFeeBps, 1_000);

        vm.expectRevert(EulrHookRegistry.InvalidStatusTransition.selector);
        vm.prank(operator);
        registry.approveHook(entryId, config);
    }

    function test_PayTemplateFeeSplitsNativeFee() public {
        uint256 entryId = _approveDefaultHook();
        address payer = makeAddr("payer");
        vm.deal(payer, 1 ether);

        vm.expectEmit(true, true, true, true);
        emit HookTemplateFeePaid(entryId, payer, address(0), 1 ether, 0.1 ether, 0.9 ether);
        vm.prank(payer);
        registry.payTemplateFee{value: 1 ether}(entryId, payer);

        assertEq(protocolRecipient.balance, 0.1 ether);
        assertEq(creatorRecipient.balance, 0.9 ether);
    }

    function test_PayTemplateFeeHandlesFreeAndErc20Fees() public {
        uint256 freeEntryId = _approveHookWithFeeConfig(
            IEulrHookRegistry.TemplateFeeConfig({
                feeCurrency: address(0),
                oneTimeFee: 0,
                creatorFeeRecipient: address(0),
                protocolFeeRecipient: address(0),
                protocolFeeBps: 0
            })
        );

        (uint256 grossAmount, uint256 protocolAmount, uint256 creatorAmount) =
            registry.payTemplateFee(freeEntryId, submitter);
        assertEq(grossAmount, 0);
        assertEq(protocolAmount, 0);
        assertEq(creatorAmount, 0);

        vm.expectRevert(EulrHookRegistry.IncorrectNativeFee.selector);
        registry.payTemplateFee{value: 1}(freeEntryId, submitter);

        MockTemplateFeeToken token = new MockTemplateFeeToken();
        uint256 erc20EntryId = _approveHookWithFeeConfig(
            IEulrHookRegistry.TemplateFeeConfig({
                feeCurrency: address(token),
                oneTimeFee: 1_000 ether,
                creatorFeeRecipient: creatorRecipient,
                protocolFeeRecipient: protocolRecipient,
                protocolFeeBps: 2_500
            })
        );
        address payer = makeAddr("erc20Payer");
        token.mint(payer, 1_000 ether);
        vm.prank(payer);
        token.approve(address(registry), 1_000 ether);

        vm.prank(payer);
        registry.payTemplateFee(erc20EntryId, payer);

        assertEq(token.balanceOf(protocolRecipient), 250 ether);
        assertEq(token.balanceOf(creatorRecipient), 750 ether);

        vm.expectRevert(EulrHookRegistry.IncorrectNativeFee.selector);
        registry.payTemplateFee{value: 1}(erc20EntryId, payer);
    }

    function test_PayTemplateFeeRejectsThirdPartyErc20Payer() public {
        MockTemplateFeeToken token = new MockTemplateFeeToken();
        uint256 entryId = _approveHookWithFeeConfig(
            IEulrHookRegistry.TemplateFeeConfig({
                feeCurrency: address(token),
                oneTimeFee: 1_000 ether,
                creatorFeeRecipient: creatorRecipient,
                protocolFeeRecipient: protocolRecipient,
                protocolFeeBps: 2_500
            })
        );
        address payer = makeAddr("erc20Payer");
        address attacker = makeAddr("attacker");
        token.mint(payer, 2_000 ether);
        vm.prank(payer);
        token.approve(address(registry), 2_000 ether);

        vm.prank(attacker);
        vm.expectRevert(EulrHookRegistry.UnauthorizedFeePayer.selector);
        registry.payTemplateFee(entryId, payer);

        assertEq(token.balanceOf(payer), 2_000 ether);
        assertEq(token.balanceOf(protocolRecipient), 0);
        assertEq(token.balanceOf(creatorRecipient), 0);

        vm.prank(operator);
        registry.setFeeCollector(attacker, true);
        vm.prank(attacker);
        registry.payTemplateFee(entryId, payer);
        assertEq(token.balanceOf(protocolRecipient), 250 ether);
        assertEq(token.balanceOf(creatorRecipient), 750 ether);
    }

    function test_PayTemplateFeeRejectsInvalidPayerStatusAndNativeTransferFailure() public {
        uint256 entryId = _submitDefaultHook();

        vm.expectRevert(EulrHookRegistry.ZeroAddress.selector);
        registry.payTemplateFee(entryId, address(0));

        vm.expectRevert(EulrHookRegistry.InvalidStatusTransition.selector);
        registry.payTemplateFee(entryId, submitter);

        RejectNativeFeeRecipient rejectingRecipient = new RejectNativeFeeRecipient();
        entryId = _approveHookWithFeeConfig(
            IEulrHookRegistry.TemplateFeeConfig({
                feeCurrency: address(0),
                oneTimeFee: 1 ether,
                creatorFeeRecipient: address(rejectingRecipient),
                protocolFeeRecipient: protocolRecipient,
                protocolFeeBps: 0
            })
        );

        vm.deal(submitter, 1 ether);
        vm.prank(submitter);
        vm.expectRevert("native fee transfer failed");
        registry.payTemplateFee{value: 1 ether}(entryId, submitter);
    }

    function _submitDefaultHook() internal returns (uint256 entryId) {
        vm.prank(submitter);
        entryId = registry.submitHook(_submission(_hookWithFlags(BEFORE_AFTER_FLAGS)));
    }

    function _approveDefaultHook() internal returns (uint256 entryId) {
        entryId = _approveHookWithFeeConfig(_approvalConfig().feeConfig);
    }

    function _approveHookWithFeeConfig(IEulrHookRegistry.TemplateFeeConfig memory feeConfig)
        internal
        returns (uint256 entryId)
    {
        entryId = _submitDefaultHook();
        vm.prank(operator);
        registry.markValidated(entryId, keccak256("validation"), "ipfs://validation");
        vm.prank(operator);
        registry.markSimulated(entryId, keccak256("simulation"), "ipfs://simulation");
        IEulrHookRegistry.ApprovalConfig memory config =
            IEulrHookRegistry.ApprovalConfig({launchModes: registry.LAUNCH_MODE_CURVE_FIRST(), feeConfig: feeConfig});
        vm.prank(operator);
        registry.approveHook(entryId, config);
    }

    function _submission(address hook) internal view returns (IEulrHookRegistry.HookSubmission memory submission) {
        submission = IEulrHookRegistry.HookSubmission({
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
