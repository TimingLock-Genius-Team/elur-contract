// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {IEulrFactory} from "../src/interfaces/IEulrFactory.sol";
import {IEulrHook} from "../src/interfaces/IEulrHook.sol";
import {IEulrRouter} from "../src/interfaces/IEulrRouter.sol";
import {EulrScriptBase} from "./EulrScriptBase.s.sol";

contract SimulateGraduation is EulrScriptBase {
    function run() external returns (uint256 buys) {
        IEulrFactory.TokenInfo memory info = _tokenInfo();
        IEulrHook hook = IEulrHook(info.hook);
        address recipient = _recipient();
        uint256 buySize = vm.envOr("GRADUATION_BUY_SIZE", uint256(10 ether));

        vm.startBroadcast(_privateKey());
        while (!hook.selfDeprecated()) {
            IEulrRouter(info.router).buy{value: buySize}(info.token, 0, recipient);
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
