// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {IEulrFactory} from "../src/interfaces/IEulrFactory.sol";
import {IEulrHook} from "../src/interfaces/IEulrHook.sol";
import {EulrScriptBase} from "./EulrScriptBase.s.sol";

contract MigrateLiquidity is EulrScriptBase {
    function run() external returns (address pool, uint256 liquidity) {
        IEulrFactory.TokenInfo memory info = _tokenInfo();
        bytes memory migrationData = vm.envOr("MIGRATION_DATA", bytes(""));

        vm.startBroadcast(_privateKey());
        (pool, liquidity) = IEulrHook(info.hook).migrateLiquidity(migrationData);
        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("token", info.token);
        console2.log("hook", info.hook);
        console2.log("pool", pool);
        console2.log("liquidity", liquidity);
        console2.log("liquidityMigrated", IEulrHook(info.hook).liquidityMigrated());
    }
}
