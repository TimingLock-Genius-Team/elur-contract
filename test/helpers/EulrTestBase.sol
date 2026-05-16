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
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract EulrTestBase is Test {
    address internal creator = makeAddr("creator");
    address internal trader = makeAddr("trader");
    address internal recipient = makeAddr("recipient");
    address internal feeRecipient = makeAddr("feeRecipient");

    MockMigrationTarget internal migrationTarget;
    EulrFactory internal factoryImplementation;
    EulrRouter internal routerImplementation;
    EulrFactory internal factory;

    /// @dev With `Curve.defaultParams()` and 10 OKB gross buys, implied mint first reaches `selfDeprecationBps` on this 1-indexed buy count.
    uint256 internal constant GRADUATION_10OKB_BUYS = 17;
    /// @dev Buys that keep the hook below the graduation threshold; the next buy is expected to cross and emit `SelfDeprecated`.
    uint256 internal constant GRADUATION_10OKB_BUYS_BEFORE_THRESHOLD = 16;

    function setUp() public virtual {
        migrationTarget = new MockMigrationTarget();
        factory = deployFactory(feeRecipient);
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

    function createToken(string memory name, string memory symbol, address tokenCreator, uint16 curveS)
        internal
        returns (EulrToken token, EulrHook hook, EulrRouter router)
    {
        vm.prank(tokenCreator);
        (address tokenAddr, address hookAddr, address routerAddr) =
            factory.createToken(name, symbol, "ipfs://demo", "https://demo.example", curveS);

        token = EulrToken(tokenAddr);
        hook = EulrHook(payable(hookAddr));
        router = EulrRouter(payable(routerAddr));
    }

    function deployFactory(address feeRecipient_) internal returns (EulrFactory) {
        return deployFactory(feeRecipient_, address(migrationTarget));
    }

    function deployFactory(address feeRecipient_, address migrationTarget_) internal returns (EulrFactory) {
        routerImplementation = new EulrRouter();
        factoryImplementation = new EulrFactory();

        TransparentUpgradeableProxy factoryProxy = new TransparentUpgradeableProxy(
            address(factoryImplementation),
            address(this),
            abi.encodeCall(
                EulrFactory.initialize,
                (feeRecipient_, migrationTarget_, address(routerImplementation), address(this), address(this))
            )
        );

        return EulrFactory(address(factoryProxy));
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
