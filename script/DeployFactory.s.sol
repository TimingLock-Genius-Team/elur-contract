// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SatpadFactory} from "../src/factory/SatpadFactory.sol";

contract DeployFactory is Script {
    function run() external returns (SatpadFactory factory) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address feeRecipient = vm.envAddress("TEAM_MULTISIG");
        address sat1HookDeployer = vm.envAddress("SAT1_HOOK_DEPLOYER");
        address poolManager = vm.envAddress("UNISWAP_V4_POOL_MANAGER");
        address positionManager = vm.envAddress("UNISWAP_V4_POSITION_MANAGER");
        address migrationTarget = vm.envAddress("MIGRATION_TARGET");

        vm.startBroadcast(deployerKey);
        factory = new SatpadFactory(feeRecipient, sat1HookDeployer, poolManager, positionManager, migrationTarget);
        vm.stopBroadcast();
    }
}
