// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {IEulrFactory} from "../src/interfaces/IEulrFactory.sol";
import {IEulrHook} from "../src/interfaces/IEulrHook.sol";
import {EulrScriptBase} from "./EulrScriptBase.s.sol";

contract ClaimFees is EulrScriptBase {
    function run() external returns (uint256 amount) {
        IEulrFactory.TokenInfo memory info = _tokenInfo();
        IEulrHook hook = IEulrHook(info.hook);
        address recipient = _recipient();

        uint256 beforeClaim = hook.claimableFeeOkb();

        vm.startBroadcast(_privateKey());
        amount = hook.claimFees(recipient);
        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("token", info.token);
        console2.log("hook", info.hook);
        console2.log("recipient", recipient);
        console2.log("claimed", amount);
        console2.log("claimableBefore", beforeClaim);
        console2.log("claimableAfter", hook.claimableFeeOkb());
    }
}
