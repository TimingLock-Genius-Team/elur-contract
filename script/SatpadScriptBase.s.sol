// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ISatpadFactory} from "../src/interfaces/ISatpadFactory.sol";
import {ISatpadHook} from "../src/interfaces/ISatpadHook.sol";
import {ISatpadRouter} from "../src/interfaces/ISatpadRouter.sol";
import {ISatpadToken} from "../src/interfaces/ISatpadToken.sol";

abstract contract SatpadScriptBase is Script {
    function _privateKey() internal view returns (uint256) {
        return vm.envUint("PRIVATE_KEY");
    }

    function _broadcaster() internal view returns (address) {
        return vm.addr(_privateKey());
    }

    function _factory() internal view returns (ISatpadFactory) {
        return ISatpadFactory(vm.envAddress("FACTORY"));
    }

    function _token() internal view returns (address) {
        return vm.envAddress("TOKEN");
    }

    function _tokenInfo() internal view returns (ISatpadFactory.TokenInfo memory info) {
        info = _factory().getTokenInfo(_token());
    }

    function _recipient() internal view returns (address) {
        return vm.envOr("RECIPIENT", _broadcaster());
    }

    function _logTokenInfo(ISatpadFactory.TokenInfo memory info) internal view {
        ISatpadHook hook = ISatpadHook(info.hook);
        console2.log("chainId", block.chainid);
        console2.log("token", info.token);
        console2.log("hook", info.hook);
        console2.log("router", info.router);
        console2.log("creator", info.creator);
        console2.log("metadataURI", info.metadataURI);
        console2.log("socialURI", info.socialURI);
        console2.log("okbCum", hook.okbCum());
        console2.log("totalMinted", hook.totalMinted());
        console2.log("tokenSupply", ISatpadToken(info.token).totalSupply());
        console2.log("selfDeprecated", hook.selfDeprecated());
        console2.log("liquidityMigrated", hook.liquidityMigrated());
    }
}
