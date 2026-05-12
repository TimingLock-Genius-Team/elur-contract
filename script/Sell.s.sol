// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {ISatpadFactory} from "../src/interfaces/ISatpadFactory.sol";
import {ISatpadHook} from "../src/interfaces/ISatpadHook.sol";
import {ISatpadRouter} from "../src/interfaces/ISatpadRouter.sol";
import {ISatpadToken} from "../src/interfaces/ISatpadToken.sol";
import {SatpadScriptBase} from "./SatpadScriptBase.s.sol";

contract Sell is SatpadScriptBase {
    function run() external returns (uint256 okbOut) {
        ISatpadFactory.TokenInfo memory info = _tokenInfo();
        uint256 tokensIn = vm.envUint("TOKENS_IN");
        uint256 minOkbOut = _requiredMinOut("MIN_OKB_OUT");
        address recipient = _recipient();

        // Forge simulates scripts before broadcasting; advance the simulated block
        // so smoke tests do not trip the protocol's same-block sell guard.
        vm.roll(block.number + 1);

        vm.startBroadcast(_privateKey());
        ISatpadToken(info.token).approve(info.router, tokensIn);
        okbOut = ISatpadRouter(info.router).sell(info.token, tokensIn, minOkbOut, recipient);
        vm.stopBroadcast();

        ISatpadHook hook = ISatpadHook(info.hook);
        console2.log("chainId", block.chainid);
        console2.log("token", info.token);
        console2.log("recipient", recipient);
        console2.log("tokensIn", tokensIn);
        console2.log("okbOut", okbOut);
        console2.log("okbCum", hook.okbCum());
        console2.log("totalMinted", hook.totalMinted());
        console2.log("selfDeprecated", hook.selfDeprecated());
    }
}
