// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SatpadFactory} from "../../src/factory/SatpadFactory.sol";

contract XLayerAddressForkTest is Test {
    error MissingCode(address target);

    function test_XLayerExternalAddressesHaveCode() public view {
        if (!_isExpectedForkChain()) {
            return;
        }

        _requireCode(vm.envAddress("UNISWAP_V4_POOL_MANAGER"));
        _requireCode(vm.envAddress("UNISWAP_V4_POSITION_MANAGER"));
        _requireCode(vm.envAddress("MIGRATION_TARGET"));
    }

    function test_FactoryDeploysWithVerifiedProductionAddresses() public {
        if (!_isExpectedForkChain()) {
            return;
        }

        address feeRecipient = vm.envAddress("TEAM_MULTISIG");
        address migrationTarget = vm.envAddress("MIGRATION_TARGET");

        SatpadFactory factory = new SatpadFactory(feeRecipient, migrationTarget);

        assertEq(factory.feeRecipient(), feeRecipient);
        assertEq(factory.migrationTarget(), migrationTarget);
    }

    function _isExpectedForkChain() internal view returns (bool) {
        return block.chainid == vm.envOr("XLAYER_CHAIN_ID", uint256(196));
    }

    function _requireCode(address target) internal view {
        if (target.code.length == 0) {
            revert MissingCode(target);
        }
    }
}
