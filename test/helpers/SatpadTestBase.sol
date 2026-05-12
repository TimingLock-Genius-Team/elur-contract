// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BuyQuote, CurveParams, SellQuote} from "../../src/curve/CurveTypes.sol";
import {ISatpadFactory} from "../../src/interfaces/ISatpadFactory.sol";
import {SatpadFactory} from "../../src/factory/SatpadFactory.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";
import {MockExternalDependency} from "../mocks/MockExternalDependency.sol";
import {MockMigrationTarget} from "../mocks/MockMigrationTarget.sol";

contract SatpadTestBase is Test {
    address internal creator = makeAddr("creator");
    address internal trader = makeAddr("trader");
    address internal recipient = makeAddr("recipient");
    address internal feeRecipient = makeAddr("feeRecipient");

    MockExternalDependency internal poolManager;
    MockExternalDependency internal positionManager;
    MockMigrationTarget internal migrationTarget;
    SatpadFactory internal factory;

    function setUp() public virtual {
        poolManager = new MockExternalDependency();
        positionManager = new MockExternalDependency();
        migrationTarget = new MockMigrationTarget();
        factory =
            new SatpadFactory(feeRecipient, address(poolManager), address(positionManager), address(migrationTarget));
    }

    function createDemoToken() internal returns (SatpadToken token, SatpadHook hook, SatpadRouter router) {
        vm.prank(creator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            factory.createToken("Demo", "DEMO", "ipfs://demo", "https://demo.example");

        token = SatpadToken(tokenAddr);
        hook = SatpadHook(payable(hookAddr));
        router = SatpadRouter(payable(routerAddr));
    }

    function createToken(string memory name, string memory symbol, address tokenCreator)
        internal
        returns (SatpadToken token, SatpadHook hook, SatpadRouter router)
    {
        vm.prank(tokenCreator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            factory.createToken(name, symbol, "ipfs://demo", "https://demo.example");

        token = SatpadToken(tokenAddr);
        hook = SatpadHook(payable(hookAddr));
        router = SatpadRouter(payable(routerAddr));
    }

    function deployFactory(address feeRecipient_) internal returns (SatpadFactory) {
        return
            new SatpadFactory(feeRecipient_, address(poolManager), address(positionManager), address(migrationTarget));
    }

    function buy(SatpadRouter router, SatpadToken token, address buyer, uint256 okbIn)
        internal
        returns (uint256 tokensOut)
    {
        vm.deal(buyer, okbIn);
        vm.prank(buyer);
        tokensOut = router.buy{value: okbIn}(address(token), 0, buyer);
    }
}
