// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {IEulrFactory} from "../src/interfaces/IEulrFactory.sol";
import {IEulrHook} from "../src/interfaces/IEulrHook.sol";
import {IEulrRouter} from "../src/interfaces/IEulrRouter.sol";
import {EulrScriptBase} from "./EulrScriptBase.s.sol";

contract Buy is EulrScriptBase {
    function run() external returns (uint256 tokensOut) {
        IEulrFactory.TokenInfo memory info = _tokenInfo();
        uint256 okbIn = vm.envUint("OKB_IN");
        uint256 minTokensOut = _requiredMinOut("MIN_TOKENS_OUT");
        address recipient = _recipient();

        vm.startBroadcast(_privateKey());
        tokensOut = IEulrRouter(info.router).buy{value: okbIn}(info.token, minTokensOut, recipient);
        vm.stopBroadcast();

        IEulrHook hook = IEulrHook(info.hook);
        console2.log("chainId", block.chainid);
        console2.log("token", info.token);
        console2.log("recipient", recipient);
        console2.log("okbIn", okbIn);
        console2.log("tokensOut", tokensOut);
        console2.log("okbCum", hook.okbCum());
        console2.log("totalMinted", hook.totalMinted());
        console2.log("selfDeprecated", hook.selfDeprecated());
    }
}
