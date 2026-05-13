// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {IEulrFactory} from "../src/interfaces/IEulrFactory.sol";
import {EulrScriptBase} from "./EulrScriptBase.s.sol";

contract CreateToken is EulrScriptBase {
    function run() external returns (address token, address hook, address router) {
        string memory name = vm.envString("TOKEN_NAME");
        string memory symbol = vm.envString("TOKEN_SYMBOL");
        string memory metadataURI = vm.envOr("METADATA_URI", string(""));
        string memory socialURI = vm.envOr("SOCIAL_URI", string(""));

        vm.startBroadcast(_privateKey());
        (token, hook, router) = _factory().createToken(name, symbol, metadataURI, socialURI);
        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("token", token);
        console2.log("hook", hook);
        console2.log("router", router);

        IEulrFactory.TokenInfo memory info = _factory().getTokenInfo(token);
        _logTokenInfo(info);
    }
}
