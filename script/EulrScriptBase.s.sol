// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IEulrFactory} from "../src/interfaces/IEulrFactory.sol";
import {IEulrHook} from "../src/interfaces/IEulrHook.sol";
import {IEulrRouter} from "../src/interfaces/IEulrRouter.sol";
import {IEulrToken} from "../src/interfaces/IEulrToken.sol";

abstract contract EulrScriptBase is Script {
    error UnsafeZeroMinOut(string envName);

    function _privateKey() internal view returns (uint256) {
        return vm.envUint("PRIVATE_KEY");
    }

    function _broadcaster() internal view returns (address) {
        return vm.addr(_privateKey());
    }

    function _factory() internal view returns (IEulrFactory) {
        return IEulrFactory(vm.envAddress("FACTORY"));
    }

    function _token() internal view returns (address) {
        return vm.envAddress("TOKEN");
    }

    function _tokenInfo() internal view returns (IEulrFactory.TokenInfo memory info) {
        info = _factory().getTokenInfo(_token());
    }

    function _recipient() internal view returns (address) {
        return vm.envOr("RECIPIENT", _broadcaster());
    }

    function _requiredMinOut(string memory envName) internal view returns (uint256 value) {
        value = vm.envOr(envName, uint256(0));
        if (value == 0 && !vm.envOr("ALLOW_ZERO_MIN_OUT", false)) {
            revert UnsafeZeroMinOut(envName);
        }
    }

    function _logTokenInfo(IEulrFactory.TokenInfo memory info) internal view {
        IEulrHook hook = IEulrHook(info.hook);
        console2.log("chainId", block.chainid);
        console2.log("token", info.token);
        console2.log("hook", info.hook);
        console2.log("router", info.router);
        console2.log("creator", info.creator);
        console2.log("metadataURI", info.metadataURI);
        console2.log("socialURI", info.socialURI);
        console2.log("okbCum", hook.okbCum());
        console2.log("claimableFeeOkb", hook.claimableFeeOkb());
        console2.log("totalMinted", hook.totalMinted());
        console2.log("curveS", hook.getCurveParams().s / 1e18);
        console2.log("tokenSupply", IEulrToken(info.token).totalSupply());
        console2.log("selfDeprecated", hook.selfDeprecated());
        console2.log("liquidityMigrated", hook.liquidityMigrated());
    }
}
