// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {SellQuote} from "../src/curve/CurveTypes.sol";
import {IEulrHook} from "../src/interfaces/IEulrHook.sol";
import {EulrScriptBase} from "./EulrScriptBase.s.sol";

contract QuoteSell is EulrScriptBase {
    function run() external view returns (SellQuote memory quote) {
        uint256 tokensIn = vm.envUint("TOKENS_IN");
        quote = IEulrHook(_tokenInfo().hook).quoteSell(tokensIn);

        console2.log("chainId", block.chainid);
        console2.log("tokensIn", quote.tokensIn);
        console2.log("grossOkbOut", quote.grossOkbOut);
        console2.log("fee", quote.fee);
        console2.log("netOkbOut", quote.netOkbOut);
        console2.log("oldOkbCum", quote.oldOkbCum);
        console2.log("newOkbCum", quote.newOkbCum);
        console2.log("oldMinted", quote.oldMinted);
        console2.log("newMinted", quote.newMinted);
    }
}
