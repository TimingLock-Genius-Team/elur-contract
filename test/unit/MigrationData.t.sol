// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MigrationData} from "../../src/migration/MigrationData.sol";

contract MigrationDataHarness {
    function decodeAndValidate(bytes calldata data, uint256 currentTimestamp)
        external
        pure
        returns (MigrationData.Params memory)
    {
        return MigrationData.decodeAndValidate(data, currentTimestamp);
    }

    function decodeAndValidateWithRecipient(bytes calldata data, uint256 currentTimestamp, address expectedLpRecipient)
        external
        pure
        returns (MigrationData.Params memory)
    {
        return MigrationData.decodeAndValidate(data, currentTimestamp, expectedLpRecipient);
    }
}

contract MigrationDataTest is Test {
    MigrationDataHarness internal harness;

    function setUp() public {
        harness = new MigrationDataHarness();
    }

    function test_DecodeAndValidateAcceptsProductionMigrationData() public {
        MigrationData.Params memory params = MigrationData.Params({
            currency0: address(0),
            currency1: makeAddr("satpad-token"),
            hooks: address(0),
            poolFee: 3000,
            tickSpacing: 60,
            tickLower: -887_220,
            tickUpper: 887_220,
            liquidity: 1e18,
            amount0Max: 100e18,
            amount1Max: 21_000_000e18,
            deadline: block.timestamp + 1 hours,
            lpRecipient: MigrationData.BURN_ADDRESS,
            hookData: "hook-data"
        });

        MigrationData.Params memory decoded = harness.decodeAndValidate(abi.encode(params), block.timestamp);

        assertEq(decoded.currency0, params.currency0);
        assertEq(decoded.currency1, params.currency1);
        assertEq(decoded.poolFee, params.poolFee);
        assertEq(decoded.tickSpacing, params.tickSpacing);
        assertEq(decoded.tickLower, params.tickLower);
        assertEq(decoded.tickUpper, params.tickUpper);
        assertEq(decoded.liquidity, params.liquidity);
        assertEq(decoded.amount0Max, params.amount0Max);
        assertEq(decoded.amount1Max, params.amount1Max);
        assertEq(decoded.deadline, params.deadline);
        assertEq(decoded.lpRecipient, params.lpRecipient);
        assertEq(decoded.hookData, params.hookData);
    }

    function test_RevertWhen_CurrencyOrderInvalid() public {
        MigrationData.Params memory params = _validParams();
        params.currency0 = makeAddr("token-high");
        params.currency1 = address(0);

        vm.expectRevert(MigrationData.InvalidCurrencyOrder.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);
    }

    function test_RevertWhen_LiquidityOrAmountsAreZero() public {
        MigrationData.Params memory params = _validParams();

        params.liquidity = 0;
        vm.expectRevert(MigrationData.ZeroLiquidity.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);

        params = _validParams();
        params.amount0Max = 0;
        vm.expectRevert(MigrationData.ZeroAmountMax.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);

        params = _validParams();
        params.amount1Max = 0;
        vm.expectRevert(MigrationData.ZeroAmountMax.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);
    }

    function test_RevertWhen_PoolFeeOrTickSpacingInvalid() public {
        MigrationData.Params memory params = _validParams();
        params.poolFee = 0;

        vm.expectRevert(MigrationData.ZeroPoolFee.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);

        params = _validParams();
        params.tickSpacing = 0;
        vm.expectRevert(MigrationData.InvalidTickSpacing.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);

        params = _validParams();
        params.tickSpacing = -60;
        vm.expectRevert(MigrationData.InvalidTickSpacing.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);
    }

    function test_RevertWhen_DeadlineExpiredOrRecipientUnsafe() public {
        MigrationData.Params memory params = _validParams();
        params.deadline = block.timestamp - 1;

        vm.expectRevert(MigrationData.ExpiredDeadline.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);

        params = _validParams();
        params.lpRecipient = makeAddr("team-eoa");
        vm.expectRevert(MigrationData.UnsafeLpRecipient.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);
    }

    function test_DecodeAndValidateAcceptsConfiguredLockRecipient() public {
        address lockRecipient = makeAddr("lp-locker");
        MigrationData.Params memory params = _validParams();
        params.lpRecipient = lockRecipient;

        MigrationData.Params memory decoded =
            harness.decodeAndValidateWithRecipient(abi.encode(params), block.timestamp, lockRecipient);

        assertEq(decoded.lpRecipient, lockRecipient);
    }

    function test_RevertWhen_TicksInvalid() public {
        MigrationData.Params memory params = _validParams();
        params.tickLower = params.tickUpper;

        vm.expectRevert(MigrationData.InvalidTickRange.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);

        params = _validParams();
        params.tickLower = -61;
        vm.expectRevert(MigrationData.TickSpacingMismatch.selector);
        harness.decodeAndValidate(abi.encode(params), block.timestamp);
    }

    function _validParams() internal returns (MigrationData.Params memory params) {
        params = MigrationData.Params({
            currency0: address(0),
            currency1: makeAddr("satpad-token"),
            hooks: address(0),
            poolFee: 3000,
            tickSpacing: 60,
            tickLower: -887_220,
            tickUpper: 887_220,
            liquidity: 1e18,
            amount0Max: 100e18,
            amount1Max: 21_000_000e18,
            deadline: block.timestamp + 1 hours,
            lpRecipient: MigrationData.BURN_ADDRESS,
            hookData: ""
        });
    }
}
