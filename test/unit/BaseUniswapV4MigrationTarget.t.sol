// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BaseUniswapV4MigrationTarget} from "../../src/migration/BaseUniswapV4MigrationTarget.sol";
import {MigrationData} from "../../src/migration/MigrationData.sol";

contract MockExternalContract {
    receive() external payable {}
}

contract MigrationTargetHarness is BaseUniswapV4MigrationTarget {
    address public lastToken;
    uint256 public lastOkbAmount;
    uint256 public lastTokenAmount;
    MigrationData.Params public lastParams;

    address internal immutable pool_;
    uint256 internal immutable positionId_;
    uint128 internal immutable liquidity_;

    constructor(address poolManager, address positionManager, address lpRecipient)
        BaseUniswapV4MigrationTarget(poolManager, positionManager, lpRecipient)
    {
        pool_ = address(0xBEEF);
        positionId_ = 123;
        liquidity_ = 1e18;
    }

    function _migrateValidated(
        address token,
        uint256 okbAmount,
        uint256 tokenAmount,
        MigrationData.Params memory params
    ) internal override returns (address pool, uint256 positionId, uint128 liquidity) {
        lastToken = token;
        lastOkbAmount = okbAmount;
        lastTokenAmount = tokenAmount;
        lastParams = params;
        (bool ok,) = poolManager.call{value: okbAmount}("");
        require(ok, "mock pool manager rejected okb");
        return (pool_, positionId_, liquidity_);
    }
}

contract ResidualOkbMigrationTargetHarness is BaseUniswapV4MigrationTarget {
    constructor(address poolManager, address positionManager, address lpRecipient)
        BaseUniswapV4MigrationTarget(poolManager, positionManager, lpRecipient)
    {}

    function _migrateValidated(address, uint256, uint256, MigrationData.Params memory)
        internal
        pure
        override
        returns (address pool, uint256 positionId, uint128 liquidity)
    {
        return (address(0xBEEF), 123, 1e18);
    }
}

contract BaseUniswapV4MigrationTargetTest is Test {
    address internal token = makeAddr("eulr-token");
    address internal lpRecipient = MigrationData.BURN_ADDRESS;
    MockExternalContract internal poolManager;
    MockExternalContract internal positionManager;
    MigrationTargetHarness internal target;

    function setUp() public {
        poolManager = new MockExternalContract();
        positionManager = new MockExternalContract();
        target = new MigrationTargetHarness(address(poolManager), address(positionManager), lpRecipient);
    }

    function test_ConstructorFixesDependenciesAndRejectsUnsafeAddresses() public {
        assertEq(target.poolManager(), address(poolManager));
        assertEq(target.positionManager(), address(positionManager));
        assertEq(target.lpRecipient(), lpRecipient);

        vm.expectRevert(BaseUniswapV4MigrationTarget.ZeroAddress.selector);
        new MigrationTargetHarness(address(poolManager), address(positionManager), address(0));

        vm.expectRevert(BaseUniswapV4MigrationTarget.DependencyHasNoCode.selector);
        new MigrationTargetHarness(address(0xCAFE), address(positionManager), lpRecipient);
    }

    function test_MigrateValidatesMigrationDataAndEmitsCustodyProof() public {
        MigrationData.Params memory params = _validParams();

        vm.expectEmit(true, true, true, true);
        emit BaseUniswapV4MigrationTarget.LpCustodyProven(token, address(0xBEEF), 123, 1e18, lpRecipient);

        (address pool, uint256 liquidity) = target.migrate{value: 10e18}(token, 10e18, 1_000e18, abi.encode(params));

        assertEq(pool, address(0xBEEF));
        assertEq(liquidity, 1e18);
        assertEq(target.lastToken(), token);
        assertEq(target.lastOkbAmount(), 10e18);
        assertEq(target.lastTokenAmount(), 1_000e18);
    }

    function test_MigrateIgnoresPreExistingNativeDust() public {
        MigrationData.Params memory params = _validParams();
        vm.deal(address(target), 1 wei);

        (address pool, uint256 liquidity) = target.migrate{value: 10e18}(token, 10e18, 1_000e18, abi.encode(params));

        assertEq(pool, address(0xBEEF));
        assertEq(liquidity, 1e18);
        assertEq(address(target).balance, 1 wei);
    }

    function test_MigrateAllowsConfiguredLockRecipient() public {
        address lockRecipient = address(new MockExternalContract());
        MigrationTargetHarness lockTarget =
            new MigrationTargetHarness(address(poolManager), address(positionManager), lockRecipient);
        MigrationData.Params memory params = _validParams();
        params.lpRecipient = lockRecipient;

        vm.expectEmit(true, true, true, true);
        emit BaseUniswapV4MigrationTarget.LpCustodyProven(token, address(0xBEEF), 123, 1e18, lockRecipient);

        (address pool, uint256 liquidity) = lockTarget.migrate{value: 10e18}(token, 10e18, 1_000e18, abi.encode(params));

        assertEq(pool, address(0xBEEF));
        assertEq(liquidity, 1e18);
    }

    function test_RevertWhen_ValueOrMigratedAmountsAreInvalid() public {
        MigrationData.Params memory params = _validParams();

        vm.expectRevert(BaseUniswapV4MigrationTarget.InvalidOkbValue.selector);
        target.migrate{value: 9e18}(token, 10e18, 1_000e18, abi.encode(params));

        vm.expectRevert(BaseUniswapV4MigrationTarget.ZeroMigrationAmount.selector);
        target.migrate{value: 0}(token, 0, 1_000e18, abi.encode(params));

        vm.expectRevert(BaseUniswapV4MigrationTarget.ZeroMigrationAmount.selector);
        target.migrate{value: 10e18}(token, 10e18, 0, abi.encode(params));
    }

    function test_RevertWhen_PoolCurrenciesOrRecipientMismatch() public {
        MigrationData.Params memory params = _validParams();

        params.currency1 = makeAddr("other-token");
        vm.expectRevert(BaseUniswapV4MigrationTarget.InvalidPoolCurrencies.selector);
        target.migrate{value: 10e18}(token, 10e18, 1_000e18, abi.encode(params));

        params = _validParams();
        params.lpRecipient = makeAddr("team-eoa");
        vm.expectRevert(MigrationData.UnsafeLpRecipient.selector);
        target.migrate{value: 10e18}(token, 10e18, 1_000e18, abi.encode(params));
    }

    function test_RevertWhen_MigrationAmountsExceedUserProvidedMaximums() public {
        MigrationData.Params memory params = _validParams();
        params.amount0Max = 9e18;

        vm.expectRevert(BaseUniswapV4MigrationTarget.AmountMaxExceeded.selector);
        target.migrate{value: 10e18}(token, 10e18, 1_000e18, abi.encode(params));

        params = _validParams();
        params.amount1Max = 999e18;

        vm.expectRevert(BaseUniswapV4MigrationTarget.AmountMaxExceeded.selector);
        target.migrate{value: 10e18}(token, 10e18, 1_000e18, abi.encode(params));
    }

    function test_RevertWhen_AdapterLeavesResidualOkb() public {
        ResidualOkbMigrationTargetHarness residualTarget =
            new ResidualOkbMigrationTargetHarness(address(poolManager), address(positionManager), lpRecipient);

        vm.expectRevert(BaseUniswapV4MigrationTarget.ResidualOkb.selector);
        residualTarget.migrate{value: 10e18}(token, 10e18, 1_000e18, abi.encode(_validParams()));
    }

    function _validParams() internal view returns (MigrationData.Params memory params) {
        params = MigrationData.Params({
            currency0: address(0),
            currency1: token,
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
