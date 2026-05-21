// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";
import {BuyQuote} from "../src/curve/CurveTypes.sol";
import {IEulrHook} from "../src/interfaces/IEulrHook.sol";
import {EulrScriptBase} from "./EulrScriptBase.s.sol";

contract QuoteBuy is EulrScriptBase {
    function run() external view returns (BuyQuote memory quote) {
        uint256 okbIn = vm.envUint("OKB_IN");
        quote = IEulrHook(_tokenInfo().hook).quoteBuy(okbIn);

        console2.log("chainId", block.chainid);
        console2.log("grossOkbIn", quote.grossOkbIn);
        console2.log("fee", quote.fee);
        console2.log("effectiveOkbIn", quote.effectiveOkbIn);
        console2.log("oldOkbCum", quote.oldOkbCum);
        console2.log("newOkbCum", quote.newOkbCum);
        console2.log("oldMinted", quote.oldMinted);
        console2.log("newMinted", quote.newMinted);
        console2.log("burnTaxBps", quote.burnTaxBps);
        console2.log("grossTokensOut", quote.grossTokensOut);
        console2.log("burnTaxTokens", quote.burnTaxTokens);
        console2.log("tokensOut", quote.tokensOut);
    }
}
