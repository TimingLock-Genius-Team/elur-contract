// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {EulrFactory} from "../src/factory/EulrFactory.sol";
import {EulrToken} from "../src/token/EulrToken.sol";
import {Curve} from "../src/curve/Curve.sol";
import {BuyQuote, CurveParams} from "../src/curve/CurveTypes.sol";

/// @notice Deploy factory with LocalDeployFactory first, then set FACTORY and run this on anvil.
contract CreateTokenAndBuyLocal is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address factoryAddr = vm.envAddress("FACTORY");
        uint256 buyIn = vm.envOr("BUY_WEI", uint256(1 ether));
        uint16 curveS = uint16(vm.envOr("CURVE_S", uint256(100)));

        CurveParams memory p = Curve.defaultParams();
        p.s = uint256(curveS) * 1e18;
        BuyQuote memory q = Curve.quoteBuy(0, buyIn, p);
        uint256 minOut = (q.tokensOut * 99) / 100;

        vm.startBroadcast(deployerKey);
        (address tokenAddr,,) = EulrFactory(factoryAddr).createTokenAndBuy{value: buyIn}(
            "AnvilE2E", "E2E", "ipfs://anvil-e2e", "", curveS, minOut, deployer
        );
        vm.stopBroadcast();

        uint256 bal = EulrToken(tokenAddr).balanceOf(deployer);
        console2.log("token", tokenAddr);
        console2.log("deployerTokenBalance", bal);
    }
}
