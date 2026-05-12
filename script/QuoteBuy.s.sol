// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {BuyQuote} from "../src/curve/CurveTypes.sol";
import {ISatpadHook} from "../src/interfaces/ISatpadHook.sol";
import {SatpadScriptBase} from "./SatpadScriptBase.s.sol";

contract QuoteBuy is SatpadScriptBase {
    function run() external view returns (BuyQuote memory quote) {
        uint256 okbIn = vm.envUint("OKB_IN");
        quote = ISatpadHook(_tokenInfo().hook).quoteBuy(okbIn);

        console2.log("chainId", block.chainid);
        console2.log("grossOkbIn", quote.grossOkbIn);
        console2.log("fee", quote.fee);
        console2.log("effectiveOkbIn", quote.effectiveOkbIn);
        console2.log("oldOkbCum", quote.oldOkbCum);
        console2.log("newOkbCum", quote.newOkbCum);
        console2.log("oldMinted", quote.oldMinted);
        console2.log("newMinted", quote.newMinted);
        console2.log("tokensOut", quote.tokensOut);
    }
}
