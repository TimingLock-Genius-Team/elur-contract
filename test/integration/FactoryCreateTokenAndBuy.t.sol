// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {Curve} from "../../src/curve/Curve.sol";
import {BuyQuote, CurveParams} from "../../src/curve/CurveTypes.sol";

contract FactoryCreateTokenAndBuyTest is EulrTestBase {
    function quoteAt(uint16 curveS, uint256 buyIn) internal pure returns (BuyQuote memory) {
        CurveParams memory p = Curve.defaultParams();
        p.s = uint256(curveS) * 1e18;
        return Curve.quoteBuy(0, buyIn, p);
    }
    function test_CreateTokenAndBuy_MintsToRecipient() public {
        vm.deal(creator, 20 ether);
        uint256 buyIn = 1 ether;
        uint16 curveS = 100;
        BuyQuote memory q = quoteAt(curveS, buyIn);
        uint256 minOut = (q.tokensOut * 99) / 100;

        vm.prank(creator);
        (address tokenAddr,, address routerAddr) = factory.createTokenAndBuy{value: buyIn}(
            "One", "ONE", "ipfs://one", "", curveS, minOut, recipient
        );

        EulrToken t = EulrToken(tokenAddr);
        assertGt(t.balanceOf(recipient), 0);
        assertEq(factory.getTokenInfo(tokenAddr).creator, creator);
        assertTrue(routerAddr != address(0));
    }

    function test_CreateTokenAndBuy_DefaultCurveOverload() public {
        vm.deal(creator, 20 ether);
        uint256 buyIn = 0.5 ether;
        BuyQuote memory q = quoteAt(factory.DEFAULT_CURVE_S_OKB(), buyIn);
        vm.prank(creator);
        (address tokenAddr,,) = factory.createTokenAndBuy{value: buyIn}(
            "Def", "DEF", "ipfs://d", "", (q.tokensOut * 99) / 100, creator
        );
        assertGt(EulrToken(tokenAddr).balanceOf(creator), 0);
    }

    function test_CreateTokenAndBuy_RevertsIfMsgValueZero() public {
        vm.prank(creator);
        vm.expectRevert(EulrFactory.BuyAmountZero.selector);
        factory.createTokenAndBuy{value: 0}("A", "A", "ipfs://a", "", 0, creator);
    }

    function test_BuyFor_RevertsIfCallerNotFactory() public {
        (EulrToken token,, EulrRouter router) = createDemoToken();
        vm.deal(trader, 1 ether);
        vm.prank(trader);
        vm.expectRevert(EulrRouter.OnlyFactory.selector);
        router.buyFor{value: 1 ether}(trader, address(token), 0, trader);
    }
}
