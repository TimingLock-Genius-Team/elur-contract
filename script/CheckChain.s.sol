// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

contract CheckChain is Script {
    error WrongChain(uint256 expected, uint256 actual);

    function run() external view {
        uint256 expectedChainId = vm.envOr("EXPECTED_CHAIN_ID", uint256(31337));
        console2.log("chainId", block.chainid);

        if (block.chainid != expectedChainId) {
            revert WrongChain(expectedChainId, block.chainid);
        }
    }
}
