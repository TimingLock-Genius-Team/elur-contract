// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BaseUniswapV4MigrationTarget} from "../../src/migration/BaseUniswapV4MigrationTarget.sol";
import {MigrationData} from "../../src/migration/MigrationData.sol";
import {UniswapV4MintPositionTarget} from "../../src/migration/UniswapV4MintPositionTarget.sol";
import {UniswapV4PoolKey} from "../../src/migration/UniswapV4PoolKey.sol";

contract MockSatpadErc20 {
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

    receive() external payable {}

    function setPullToken(bool pullToken_) external {
        pullToken = pullToken_;
    }

    function nextTokenId() external view returns (uint256) {
        return nextId;
    }

    function getPositionLiquidity(uint256 tokenId) external view returns (uint128) {
        require(tokenId == nextId, "token id");
        return mintedLiquidity;
    }

    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable {
        lastUnlockData = unlockData;
        lastDeadline = deadline;
        lastValue = msg.value;

        (bytes memory actions, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));
        lastActions = actions;
        lastParams = params;

        (UniswapV4PoolKey.Key memory key,,,,, uint128 amount1Max,,) =
            abi.decode(params[0], (UniswapV4PoolKey.Key, int24, int24, uint256, uint128, uint128, address, bytes));

        if (pullToken) {
            require(
                MockSatpadErc20(key.currency1).transferFrom(msg.sender, address(this), amount1Max), "token pull failed"
            );
        }
    }
}

contract UniswapV4MintPositionTargetTest is Test {
    MockSatpadErc20 internal token;
    MockUniswapV4PositionManager internal positionManager;
    address internal poolManager;
    address internal lpRecipient = MigrationData.BURN_ADDRESS;
    UniswapV4MintPositionTarget internal target;

    function setUp() public {
        token = new MockSatpadErc20();
        positionManager = new MockUniswapV4PositionManager();
        poolManager = address(new MockUniswapV4PositionManager());
        target = new UniswapV4MintPositionTarget(poolManager, address(positionManager), lpRecipient);
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
        assertEq(positionManager.lastActions(), hex"020d");
        assertEq(token.balanceOf(address(target)), 0);
        assertEq(token.balanceOf(address(positionManager)), 1_000e18);
        assertEq(address(target).balance, 0);
    }

    function test_RevertWhen_PositionManagerDoesNotConsumeMigratedToken() public {
        MigrationData.Params memory params = _validParams();
        token.mint(address(target), 1_000e18);
        positionManager.setPullToken(false);

        vm.expectRevert(UniswapV4MintPositionTarget.ResidualToken.selector);
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
