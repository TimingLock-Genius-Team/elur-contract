// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BuyQuote, CurveParams, SellQuote} from "../../src/curve/CurveTypes.sol";
import {IEulrFactory} from "../../src/interfaces/IEulrFactory.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";
import {MockExternalDependency} from "../mocks/MockExternalDependency.sol";
import {MockMigrationTarget} from "../mocks/MockMigrationTarget.sol";

contract EulrTestBase is Test {
    address internal creator = makeAddr("creator");
    address internal trader = makeAddr("trader");
    address internal recipient = makeAddr("recipient");
    address internal feeRecipient = makeAddr("feeRecipient");

    MockMigrationTarget internal migrationTarget;
    EulrFactory internal factory;

    function setUp() public virtual {
        migrationTarget = new MockMigrationTarget();
        factory = new EulrFactory(feeRecipient, address(migrationTarget));
    }

    function createDemoToken() internal returns (EulrToken token, EulrHook hook, EulrRouter router) {
        vm.prank(creator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            factory.createToken("Demo", "DEMO", "ipfs://demo", "https://demo.example");

        token = EulrToken(tokenAddr);
        hook = EulrHook(payable(hookAddr));
        router = EulrRouter(payable(routerAddr));
    }

    function createToken(string memory name, string memory symbol, address tokenCreator)
        internal
        returns (EulrToken token, EulrHook hook, EulrRouter router)
    {
        vm.prank(tokenCreator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            factory.createToken(name, symbol, "ipfs://demo", "https://demo.example");

        token = EulrToken(tokenAddr);
        hook = EulrHook(payable(hookAddr));
        router = EulrRouter(payable(routerAddr));
    }

    function deployFactory(address feeRecipient_) internal returns (EulrFactory) {
        return new EulrFactory(feeRecipient_, address(migrationTarget));
    }

    function buy(EulrRouter router, EulrToken token, address buyer, uint256 okbIn)
        internal
        returns (uint256 tokensOut)
    {
        vm.deal(buyer, okbIn);
        vm.prank(buyer);
        tokensOut = router.buy{value: okbIn}(address(token), 0, buyer);
    }
}
