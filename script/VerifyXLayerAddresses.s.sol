// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

contract VerifyXLayerAddresses is Script {
    error WrongChain(uint256 actualChainId);
    error MissingCode(address target);

    function run() external view {
        uint256 expectedChainId = vm.envOr("XLAYER_CHAIN_ID", uint256(196));
        if (block.chainid != expectedChainId) {
            revert WrongChain(block.chainid);
        }

        _requireCode(vm.envAddress("SAT1_HOOK_DEPLOYER"));
        _requireCode(vm.envAddress("UNISWAP_V4_POOL_MANAGER"));
        _requireCode(vm.envAddress("UNISWAP_V4_POSITION_MANAGER"));
        _requireCode(vm.envAddress("MIGRATION_TARGET"));
    }

    function _requireCode(address target) internal view {
        if (target.code.length == 0) {
            revert MissingCode(target);
        }
    }
}
