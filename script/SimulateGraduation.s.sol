// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {ISatpadFactory} from "../src/interfaces/ISatpadFactory.sol";
import {ISatpadHook} from "../src/interfaces/ISatpadHook.sol";
import {ISatpadRouter} from "../src/interfaces/ISatpadRouter.sol";
import {SatpadScriptBase} from "./SatpadScriptBase.s.sol";

contract SimulateGraduation is SatpadScriptBase {
    function run() external returns (uint256 buys) {
        ISatpadFactory.TokenInfo memory info = _tokenInfo();
        ISatpadHook hook = ISatpadHook(info.hook);
        address recipient = _recipient();
        uint256 buySize = vm.envOr("GRADUATION_BUY_SIZE", uint256(10 ether));

        vm.startBroadcast(_privateKey());
        while (!hook.selfDeprecated()) {
            ISatpadRouter(info.router).buy{value: buySize}(info.token, 0, recipient);
            buys++;
        }
        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("token", info.token);
        console2.log("buys", buys);
        console2.log("okbCum", hook.okbCum());
        console2.log("totalMinted", hook.totalMinted());
        console2.log("selfDeprecated", hook.selfDeprecated());
    }
}
