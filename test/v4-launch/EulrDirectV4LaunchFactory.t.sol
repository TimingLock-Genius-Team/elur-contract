// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {EulrHookRegistry} from "../../src/registry/EulrHookRegistry.sol";
import {IEulrHookRegistry} from "../../src/interfaces/IEulrHookRegistry.sol";
import {EulrDirectV4LaunchFactory} from "../../src/v4-launch/EulrDirectV4LaunchFactory.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockDirectV4FeeToken is ERC20 {
    constructor() ERC20("Direct Fee", "DFEE") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract MockDirectV4PoolManager {
    PoolKey public lastKey;
    address public lastCurrency0;
    address public lastCurrency1;
    address public lastHooks;
    uint160 public lastSqrtPriceX96;

    function initialize(PoolKey calldata key, uint160 sqrtPriceX96) external returns (int24 tick) {
        lastKey = key;
        lastCurrency0 = Currency.unwrap(key.currency0);
        lastCurrency1 = Currency.unwrap(key.currency1);
        lastHooks = address(key.hooks);
        lastSqrtPriceX96 = sqrtPriceX96;
        tick = 0;
    }
}

contract MockDirectV4LiquidityTarget {
    using SafeERC20 for IERC20;

    address public lastToken;
    uint256 public lastTokenAmount;
    uint256 public lastMsgValue;
    address public lastLpRecipient;
    bool public returnZeroResult;
    bool public skipTokenPull;

    function setReturnZeroResult(bool returnZeroResult_) external {
        returnZeroResult = returnZeroResult_;
    }

    function setSkipTokenPull(bool skipTokenPull_) external {
        skipTokenPull = skipTokenPull_;
    }

    function addInitialLiquidity(
        PoolKey calldata,
        address token,
        uint256 tokenAmount,
        int24,
        int24,
        uint128 liquidity,
        address lpRecipient,
        bytes calldata
    ) external payable returns (uint256 positionId, uint128 liquidityAdded) {
        lastToken = token;
        lastTokenAmount = tokenAmount;
        lastMsgValue = msg.value;
        lastLpRecipient = lpRecipient;
        if (!skipTokenPull) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        }
        if (returnZeroResult) {
            return (0, 0);
        }
        positionId = 7;
        liquidityAdded = liquidity;
    }
}

contract EulrDirectV4LaunchFactoryTest is Test {
    uint160 internal constant BEFORE_AFTER_FLAGS = 0x00c0;
    uint160 internal constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    address internal operator = makeAddr("operator");
    address internal creator = makeAddr("creator");
    address internal author = makeAddr("author");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal lpRecipient = makeAddr("lpRecipient");

    EulrHookRegistry internal registry;
    MockDirectV4PoolManager internal poolManager;
    MockDirectV4LiquidityTarget internal liquidityTarget;
    EulrDirectV4LaunchFactory internal factory;

    event DirectV4LaunchCreated(
        uint256 indexed launchId,
        address indexed token,
        address indexed creator,
        uint256 hookRegistryEntryId,
        address hook,
        bytes32 poolId,
        uint256 positionId,
        uint128 liquidity,
        address lpRecipient
    );

    function setUp() public {
        registry = new EulrHookRegistry(operator);
        poolManager = new MockDirectV4PoolManager();
        liquidityTarget = new MockDirectV4LiquidityTarget();
        factory = new EulrDirectV4LaunchFactory(address(registry), address(poolManager), address(liquidityTarget));
        vm.prank(operator);
        registry.setFeeCollector(address(factory), true);
    }

    function test_ConstructorRejectsZeroOrMissingCodeDependencies() public {
        vm.expectRevert(EulrDirectV4LaunchFactory.ZeroAddress.selector);
        new EulrDirectV4LaunchFactory(address(0), address(poolManager), address(liquidityTarget));

        vm.expectRevert(abi.encodeWithSelector(EulrDirectV4LaunchFactory.DependencyHasNoCode.selector, address(0)));
        new EulrDirectV4LaunchFactory(makeAddr("missingRegistry"), address(poolManager), address(liquidityTarget));
    }

    function test_CreateDirectV4LaunchRequiresApprovedDirectHook() public {
        uint256 entryId = _submitHook();

        vm.deal(creator, 1 ether);
        vm.prank(creator);
        vm.expectRevert(EulrDirectV4LaunchFactory.UnapprovedHook.selector);
        factory.createDirectV4Launch{value: 1 ether}(
            _params(entryId, address(uint160(0xBEEF) << 14 | BEFORE_AFTER_FLAGS))
        );
    }

    function test_CreateDirectV4LaunchInitializesPoolMintsLiquidityAndPaysTemplateFee() public {
        uint256 entryId = _approveHook(1 ether);
        address hook = address(uint160(0xBEEF) << 14 | BEFORE_AFTER_FLAGS);
        EulrDirectV4LaunchFactory.DirectV4LaunchParams memory params = _params(entryId, hook);

        vm.deal(creator, 2 ether);
        vm.prank(creator);
        vm.expectEmit(false, false, false, false);
        emit DirectV4LaunchCreated(1, address(0), creator, entryId, hook, bytes32(0), 7, 1e18, lpRecipient);
        (uint256 launchId, address token) = factory.createDirectV4Launch{value: 2 ether}(params);

        assertEq(launchId, 1);
        assertEq(factory.nextDirectV4LaunchId(), 1);
        assertEq(EulrToken(token).factory(), address(factory));
        assertEq(EulrToken(token).hook(), address(factory));
        assertEq(EulrToken(token).balanceOf(address(factory)), 0);
        assertEq(EulrToken(token).balanceOf(address(liquidityTarget)), 1_000_000 ether);
        assertEq(liquidityTarget.lastToken(), token);
        assertEq(liquidityTarget.lastTokenAmount(), 1_000_000 ether);
        assertEq(liquidityTarget.lastMsgValue(), 1 ether);
        assertEq(liquidityTarget.lastLpRecipient(), lpRecipient);
        assertEq(feeRecipient.balance, 0.1 ether);
        assertEq(author.balance, 0.9 ether);
        assertEq(poolManager.lastCurrency0(), address(0));
        assertEq(poolManager.lastCurrency1(), token);
        assertEq(poolManager.lastHooks(), hook);
        assertEq(poolManager.lastSqrtPriceX96(), SQRT_PRICE_1_1);

        EulrDirectV4LaunchFactory.DirectV4Launch memory launch = factory.getDirectV4Launch(launchId);
        assertEq(launch.token, token);
        assertEq(launch.creator, creator);
        assertEq(launch.hookRegistryEntryId, entryId);
        assertEq(launch.hooks, hook);
        assertEq(launch.positionId, 7);
        assertEq(launch.liquidity, 1e18);
        assertEq(launch.lpRecipient, lpRecipient);
        assertEq(launch.metadataURI, "ipfs://direct");
    }

    function test_CreateDirectV4LaunchRejectsInvalidParamsAndLiquidityResults() public {
        uint256 entryId = _approveHook(0);
        address hook = address(uint160(0xBEEF) << 14 | BEFORE_AFTER_FLAGS);
        EulrDirectV4LaunchFactory.DirectV4LaunchParams memory params = _params(entryId, hook);

        params.hooks = address(0);
        vm.expectRevert(EulrDirectV4LaunchFactory.ZeroAddress.selector);
        factory.createDirectV4Launch(params);

        params = _params(entryId, hook);
        params.lpRecipient = address(0);
        vm.expectRevert(EulrDirectV4LaunchFactory.ZeroAddress.selector);
        factory.createDirectV4Launch(params);

        params = _params(entryId, hook);
        params.hooks = _hookWithFlags(0x0040);
        vm.expectRevert(EulrDirectV4LaunchFactory.UnapprovedHook.selector);
        factory.createDirectV4Launch(params);

        params = _params(entryId, hook);
        params.poolFee = 0;
        vm.expectRevert(EulrDirectV4LaunchFactory.InvalidPoolConfig.selector);
        factory.createDirectV4Launch(params);

        params = _params(entryId, hook);
        params.poolFee = 500;
        vm.expectRevert(EulrDirectV4LaunchFactory.InvalidPoolConfig.selector);
        factory.createDirectV4Launch(params);

        params = _params(entryId, hook);
        params.tickLower = -119;
        vm.expectRevert(EulrDirectV4LaunchFactory.InvalidPoolConfig.selector);
        factory.createDirectV4Launch(params);

        params = _params(entryId, hook);
        params.tickSpacing = 30;
        vm.expectRevert(EulrDirectV4LaunchFactory.InvalidPoolConfig.selector);
        factory.createDirectV4Launch(params);

        params = _params(entryId, hook);
        liquidityTarget.setReturnZeroResult(true);
        vm.expectRevert(EulrDirectV4LaunchFactory.InvalidLiquidityResult.selector);
        factory.createDirectV4Launch{value: 1 ether}(params);

        params = _params(entryId, hook);
        liquidityTarget.setReturnZeroResult(false);
        liquidityTarget.setSkipTokenPull(true);
        vm.expectRevert(EulrDirectV4LaunchFactory.InvalidLiquidityResult.selector);
        factory.createDirectV4Launch{value: 1 ether}(params);
    }

    function test_CreateDirectV4LaunchRejectsIncorrectNativeFeeAccounting() public {
        uint256 entryId = _approveHook(1 ether);
        address hook = address(uint160(0xBEEF) << 14 | BEFORE_AFTER_FLAGS);
        EulrDirectV4LaunchFactory.DirectV4LaunchParams memory params = _params(entryId, hook);

        vm.deal(creator, 1 ether);
        vm.prank(creator);
        vm.expectRevert(EulrDirectV4LaunchFactory.InvalidFeePayment.selector);
        factory.createDirectV4Launch(params);

        vm.prank(creator);
        vm.expectRevert(EulrDirectV4LaunchFactory.InvalidFeePayment.selector);
        factory.createDirectV4Launch{value: 1 ether}(params);

        entryId = _approveHook(0);
        params = _params(entryId, hook);
        vm.deal(creator, 2 ether);
        vm.prank(creator);
        vm.expectRevert(EulrDirectV4LaunchFactory.InvalidFeePayment.selector);
        factory.createDirectV4Launch{value: 2 ether}(params);
    }

    function test_CreateDirectV4LaunchPaysErc20TemplateFee() public {
        MockDirectV4FeeToken feeToken = new MockDirectV4FeeToken();
        uint256 entryId = _approveHookWithFeeConfig(
            IEulrHookRegistry.TemplateFeeConfig({
                feeCurrency: address(feeToken),
                oneTimeFee: 1_000 ether,
                creatorFeeRecipient: author,
                protocolFeeRecipient: feeRecipient,
                protocolFeeBps: 1_000
            })
        );
        address hook = address(uint160(0xBEEF) << 14 | BEFORE_AFTER_FLAGS);
        EulrDirectV4LaunchFactory.DirectV4LaunchParams memory params = _params(entryId, hook);

        feeToken.mint(creator, 1_000 ether);
        vm.deal(creator, 1 ether);
        vm.startPrank(creator);
        feeToken.approve(address(registry), 1_000 ether);
        factory.createDirectV4Launch{value: 1 ether}(params);
        vm.stopPrank();

        assertEq(feeToken.balanceOf(feeRecipient), 100 ether);
        assertEq(feeToken.balanceOf(author), 900 ether);
    }

    function test_GetDirectV4LaunchRejectsUnknownLaunch() public {
        vm.expectRevert(EulrDirectV4LaunchFactory.InvalidPoolConfig.selector);
        factory.getDirectV4Launch(1);
    }

    function _params(uint256 entryId, address hook)
        internal
        view
        returns (EulrDirectV4LaunchFactory.DirectV4LaunchParams memory params)
    {
        params = EulrDirectV4LaunchFactory.DirectV4LaunchParams({
            name: "Direct",
            symbol: "DIR",
            metadataURI: "ipfs://direct",
            hookRegistryEntryId: entryId,
            hooks: hook,
            sqrtPriceX96: SQRT_PRICE_1_1,
            poolFee: 3_000,
            tickSpacing: 60,
            tickLower: -120,
            tickUpper: 120,
            liquidity: 1e18,
            tokenAmount: 1_000_000 ether,
            nativeAmount: 1 ether,
            lpRecipient: lpRecipient,
            hookData: ""
        });
    }

    function _submitHook() internal returns (uint256 entryId) {
        address hook = _hookWithFlags(BEFORE_AFTER_FLAGS);
        vm.prank(creator);
        entryId = registry.submitHook(
            IEulrHookRegistry.HookSubmission({
                hook: hook,
                author: author,
                targetChainId: block.chainid,
                permissionMask: BEFORE_AFTER_FLAGS,
                metadataURI: "ipfs://hook",
                metadataHash: keccak256("metadata"),
                sourceMetadataHash: keccak256("source"),
                artifactMetadataHash: keccak256("artifact"),
                constructorArgsHash: keccak256("args"),
                exampleHookDataHash: keccak256("hook-data"),
                recommendedPoolFee: 3_000,
                recommendedTickSpacing: 60,
                riskLabelMask: 1
            })
        );
    }

    function _hookWithFlags(uint160 flags) internal returns (address hook) {
        hook = address(uint160(0xBEEF) << 14 | flags);
        vm.etch(hook, hex"60016000526001601ff3");
    }

    function _approveHook(uint256 fee) internal returns (uint256 entryId) {
        entryId = _approveHookWithFeeConfig(
            IEulrHookRegistry.TemplateFeeConfig({
                feeCurrency: address(0),
                oneTimeFee: fee,
                creatorFeeRecipient: author,
                protocolFeeRecipient: feeRecipient,
                protocolFeeBps: 1_000
            })
        );
    }

    function _approveHookWithFeeConfig(IEulrHookRegistry.TemplateFeeConfig memory feeConfig)
        internal
        returns (uint256 entryId)
    {
        entryId = _submitHook();
        vm.startPrank(operator);
        registry.markValidated(entryId, keccak256("validation"), "ipfs://validation");
        registry.markSimulated(entryId, keccak256("simulation"), "ipfs://simulation");
        registry.approveHook(
            entryId,
            IEulrHookRegistry.ApprovalConfig({launchModes: registry.LAUNCH_MODE_DIRECT_V4(), feeConfig: feeConfig})
        );
        vm.stopPrank();
    }
}
