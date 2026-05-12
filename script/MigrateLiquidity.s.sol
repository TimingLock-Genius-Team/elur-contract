// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {ISatpadFactory} from "../src/interfaces/ISatpadFactory.sol";
import {ISatpadHook} from "../src/interfaces/ISatpadHook.sol";
import {SatpadScriptBase} from "./SatpadScriptBase.s.sol";

contract MigrateLiquidity is SatpadScriptBase {
    function run() external returns (address pool, uint256 liquidity) {
        ISatpadFactory.TokenInfo memory info = _tokenInfo();
        bytes memory migrationData = vm.envOr("MIGRATION_DATA", bytes(""));

        vm.startBroadcast(_privateKey());
        (pool, liquidity) = ISatpadHook(info.hook).migrateLiquidity(migrationData);
        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("token", info.token);
        console2.log("hook", info.hook);
        console2.log("pool", pool);
        console2.log("liquidity", liquidity);
        console2.log("liquidityMigrated", ISatpadHook(info.hook).liquidityMigrated());
    }
}
