// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BaseUniswapV4MigrationTarget} from "../../src/migration/BaseUniswapV4MigrationTarget.sol";
import {ReentrancyGuard} from "../../src/libraries/ReentrancyGuard.sol";
import {MigrationData} from "../../src/migration/MigrationData.sol";
import {UniswapV4MintPositionTarget} from "../../src/migration/UniswapV4MintPositionTarget.sol";
import {UniswapV4PoolKey} from "../../src/migration/UniswapV4PoolKey.sol";

contract MockEulrErc20 {
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 allowance)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockUniswapV4PositionManager {
    bytes public lastActions;
    bytes[] public lastParams;
    bytes public lastUnlockData;
    uint256 public lastDeadline;
    uint256 public lastValue;
    uint256 public nextId = 77;
    uint128 public mintedLiquidity = 1e18;
    bool public pullToken = true;
    bool public reenterMigration;

    receive() external payable {}

    function setPullToken(bool pullToken_) external {
        pullToken = pullToken_;
    }

    function setReenterMigration(bool reenterMigration_) external {
        reenterMigration = reenterMigration_;
    }

    function nextTokenId() external view returns (uint256) {
        return nextId;
    }

    function getPositionLiquidity(uint256 tokenId) external view returns (uint128) {
        require(tokenId == nextId, "token id");
        return mintedLiquidity;
    }

    function lastParamsLength() external view returns (uint256) {
        return lastParams.length;
    }

    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable {
        lastUnlockData = unlockData;
        lastDeadline = deadline;
        lastValue = msg.value;

        (bytes memory actions, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));
        lastActions = actions;
        lastParams = params;

        (
            UniswapV4PoolKey.Key memory key,
            int24 tickLower,
            int24 tickUpper,
            uint256 liquidity,
            uint128 amount0Max,
            uint128 amount1Max,
            address recipient,
            bytes memory hookData
        ) = abi.decode(params[0], (UniswapV4PoolKey.Key, int24, int24, uint256, uint128, uint128, address, bytes));

        if (reenterMigration) {
            reenterMigration = false;
            MigrationData.Params memory migrationParams = MigrationData.Params({
                currency0: key.currency0,
                currency1: key.currency1,
                hooks: key.hooks,
                poolFee: key.fee,
                tickSpacing: key.tickSpacing,
                tickLower: tickLower,
                tickUpper: tickUpper,
                // Casting to uint128 is safe because the caller (`_encodeModifyLiquidities`)
                // serializes the original uint128 `params.liquidity` via abi.encode of a uint256
                // slot, so the round-tripped value never exceeds the uint128 range.
                // forge-lint: disable-next-line(unsafe-typecast)
                liquidity: uint128(liquidity),
                amount0Max: amount0Max,
                amount1Max: amount1Max,
                deadline: deadline,
                lpRecipient: recipient,
                hookData: hookData
            });
            UniswapV4MintPositionTarget(payable(msg.sender)).migrate{value: msg.value}(
                key.currency1, msg.value, amount1Max, abi.encode(migrationParams)
            );
        }

        if (pullToken) {
            require(
                MockEulrErc20(key.currency1).transferFrom(msg.sender, address(this), amount1Max), "token pull failed"
            );
        }
    }
}

contract UniswapV4MintPositionTargetTest is Test {
    MockEulrErc20 internal token;
    MockUniswapV4PositionManager internal positionManager;
    address internal poolManager;
    address internal lpRecipient = MigrationData.BURN_ADDRESS;
    UniswapV4MintPositionTarget internal target;

    function setUp() public {
        token = new MockEulrErc20();
        positionManager = new MockUniswapV4PositionManager();
        poolManager = address(new MockUniswapV4PositionManager());
        target = new UniswapV4MintPositionTarget(
            poolManager,
            address(positionManager),
            lpRecipient,
            address(0),
            3000,
            60,
            -887_220,
            887_220,
            keccak256(bytes(""))
        );
    }

    function test_MigrateMintsV4PositionWithCanonicalActionsAndPoolId() public {
        MigrationData.Params memory params = _validParams();
        token.mint(address(target), 1_000e18);
        bytes32 poolId = UniswapV4PoolKey.toId(UniswapV4PoolKey.fromMigrationData(params));

        vm.expectEmit(true, true, true, true);
        emit UniswapV4MintPositionTarget.UniswapV4PositionMinted(
            address(token), poolId, positionManager.nextTokenId(), 1e18, lpRecipient
        );
        vm.expectEmit(true, true, true, true);
        emit BaseUniswapV4MigrationTarget.LpCustodyProven(
            address(token), poolManager, positionManager.nextTokenId(), 1e18, lpRecipient
        );

        (address pool, uint256 liquidity) =
            target.migrate{value: 10e18}(address(token), 10e18, 1_000e18, abi.encode(params));

        assertEq(pool, poolManager);
        assertEq(liquidity, 1e18);
        assertEq(positionManager.lastValue(), 10e18);
        assertEq(positionManager.lastDeadline(), params.deadline);
        assertEq(positionManager.lastActions(), hex"020d14");
        assertEq(positionManager.lastParamsLength(), 3);
        (address sweepCurrency, address sweepRecipient) = abi.decode(positionManager.lastParams(2), (address, address));
        assertEq(sweepCurrency, address(0));
        assertEq(sweepRecipient, address(target));
        assertEq(token.balanceOf(address(target)), 0);
        assertEq(token.balanceOf(address(positionManager)), 1_000e18);
        assertEq(address(target).balance, 0);
    }

    function test_MigrateIgnoresPreExistingTokenDust() public {
        MigrationData.Params memory params = _validParams();
        token.mint(address(target), 1_000e18 + 1);

        (address pool, uint256 liquidity) =
            target.migrate{value: 10e18}(address(token), 10e18, 1_000e18, abi.encode(params));

        assertEq(pool, poolManager);
        assertEq(liquidity, 1e18);
        assertEq(token.balanceOf(address(target)), 1);
        assertEq(token.balanceOf(address(positionManager)), 1_000e18);
    }

    function test_RevertWhen_MigrationUsesUnapprovedHookAddress() public {
        MigrationData.Params memory params = _validParams();
        params.hooks = makeAddr("malicious-hook");
        token.mint(address(target), 1_000e18);

        vm.expectRevert(UniswapV4MintPositionTarget.UnauthorizedMigrationPool.selector);
        target.migrate{value: 10e18}(address(token), 10e18, 1_000e18, abi.encode(params));
    }

    function test_RevertWhen_MigrationUsesUnapprovedPoolFee() public {
        MigrationData.Params memory params = _validParams();
        params.poolFee = 500;
        token.mint(address(target), 1_000e18);

        vm.expectRevert(UniswapV4MintPositionTarget.UnauthorizedMigrationPool.selector);
        target.migrate{value: 10e18}(address(token), 10e18, 1_000e18, abi.encode(params));
    }

    function test_RevertWhen_MigrationUsesUnapprovedTickSpacing() public {
        MigrationData.Params memory params = _validParams();
        params.tickSpacing = 10;
        params.tickLower = -887_200;
        params.tickUpper = 887_200;
        token.mint(address(target), 1_000e18);

        vm.expectRevert(UniswapV4MintPositionTarget.UnauthorizedMigrationPool.selector);
        target.migrate{value: 10e18}(address(token), 10e18, 1_000e18, abi.encode(params));
    }

    function test_RevertWhen_MigrationUsesUnapprovedTickRange() public {
        MigrationData.Params memory params = _validParams();
        params.tickLower = -887_160;
        token.mint(address(target), 1_000e18);

        vm.expectRevert(UniswapV4MintPositionTarget.UnauthorizedMigrationPool.selector);
        target.migrate{value: 10e18}(address(token), 10e18, 1_000e18, abi.encode(params));
    }

    function test_RevertWhen_MigrationUsesUnapprovedHookData() public {
        MigrationData.Params memory params = _validParams();
        params.hookData = "malicious-hook-data";
        token.mint(address(target), 1_000e18);

        vm.expectRevert(UniswapV4MintPositionTarget.UnauthorizedHookData.selector);
        target.migrate{value: 10e18}(address(token), 10e18, 1_000e18, abi.encode(params));
    }

    function test_RevertWhen_PositionManagerDoesNotConsumeMigratedToken() public {
        MigrationData.Params memory params = _validParams();
        token.mint(address(target), 1_000e18);
        positionManager.setPullToken(false);

        vm.expectRevert(UniswapV4MintPositionTarget.ResidualToken.selector);
        target.migrate{value: 10e18}(address(token), 10e18, 1_000e18, abi.encode(params));
    }

    function test_RevertWhen_PositionManagerReentersMigration() public {
        MigrationData.Params memory params = _validParams();
        token.mint(address(target), 1_000e18);
        positionManager.setReenterMigration(true);

        vm.expectRevert(ReentrancyGuard.ReentrantCall.selector);
        target.migrate{value: 10e18}(address(token), 10e18, 1_000e18, abi.encode(params));
    }

    function test_RevertWhen_AmountMaxDoesNotFitV4PeripheryTypes() public {
        MigrationData.Params memory params = _validParams();
        params.amount1Max = uint256(type(uint128).max) + 1;
        token.mint(address(target), 1_000e18);

        vm.expectRevert(UniswapV4MintPositionTarget.AmountMaxTooLarge.selector);
        target.migrate{value: 10e18}(address(token), 10e18, 1_000e18, abi.encode(params));
    }

    function _validParams() internal view returns (MigrationData.Params memory params) {
        params = MigrationData.Params({
            currency0: address(0),
            currency1: address(token),
            hooks: address(0),
            poolFee: 3000,
            tickSpacing: 60,
            tickLower: -887_220,
            tickUpper: 887_220,
            liquidity: 1e18,
            amount0Max: 10e18,
            amount1Max: 1_000e18,
            deadline: block.timestamp + 1 hours,
            lpRecipient: lpRecipient,
            hookData: ""
        });
    }
}
