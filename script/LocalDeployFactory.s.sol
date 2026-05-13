// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {EulrFactory} from "../src/factory/EulrFactory.sol";

contract LocalExternalDependency {
    receive() external payable {}
}

contract LocalMigrationTarget {
    address public immutable pool = address(0xBEEF);
    uint256 public immutable liquidity = 1e18;

    event Migrated(address token, uint256 okbAmount, uint256 tokenAmount, bytes migrationData);

    function migrate(address token, uint256 okbAmount, uint256 tokenAmount, bytes calldata migrationData)
        external
        payable
        returns (address, uint256)
    {
        require(msg.value == okbAmount, "wrong value");
        emit Migrated(token, okbAmount, tokenAmount, migrationData);
        return (pool, liquidity);
    }
}

contract LocalDeployFactory is Script {
    function run() external returns (EulrFactory factory) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address feeRecipient = vm.envOr("TEAM_MULTISIG", vm.addr(deployerKey));

        vm.startBroadcast(deployerKey);
        LocalMigrationTarget migrationTarget = new LocalMigrationTarget();
        factory = new EulrFactory(feeRecipient, address(migrationTarget));
        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("factory", address(factory));
        console2.log("feeRecipient", feeRecipient);
        console2.log("migrationTarget", address(migrationTarget));
    }
}
