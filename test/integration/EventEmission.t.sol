// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Vm} from "forge-std/Vm.sol";
import {EulrTestBase} from "../helpers/EulrTestBase.sol";
import {BuyQuote, SellQuote} from "../../src/curve/CurveTypes.sol";
import {EulrHook} from "../../src/hook/EulrHook.sol";
import {EulrRouter} from "../../src/router/EulrRouter.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";

contract EventEmissionTest is EulrTestBase {
    event TokenCreated(
        address indexed token,
        address indexed hook,
        address router,
        address indexed creator,
        string metadataURI,
        string socialURI,
        uint16 curveS
    );
    event Bought(
        address indexed token,
        address indexed user,
        address indexed recipient,
        uint256 grossOkbIn,
        uint256 fee,
        uint256 tokensOut,
        uint256 oldOkbCum,
        uint256 newOkbCum
    );
    event Sold(
        address indexed token,
        address indexed user,
        address indexed recipient,
        uint256 tokensIn,
        uint256 grossOkbOut,
        uint256 fee,
        uint256 netOkbOut,
        uint256 oldOkbCum,
        uint256 newOkbCum
    );
    event FeesClaimed(address indexed recipient, uint256 amount);
    event LiquidityMigrated(address indexed token, address indexed pool, uint256 okbAmount, uint256 tokenAmount);
    event LiquidityMigrationResult(address indexed token, address indexed pool, uint256 liquidity);

    function test_CreateTokenEmitsIndexedCreatorMetadataAndSocialUri() public {
        vm.recordLogs();
        vm.prank(creator);
        factory.createToken("Event", "EVT", "ipfs://event", "https://event.example", 25);

        Vm.Log[] memory entries = vm.getRecordedLogs();
        Vm.Log memory tokenCreated;
        bool found;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].emitter == address(factory) && entries[i].topics[0] == TokenCreated.selector) {
                tokenCreated = entries[i];
                found = true;
                break;
            }
        }

        assertTrue(found);
        assertEq(tokenCreated.topics[3], bytes32(uint256(uint160(creator))));

        (address router, string memory metadataURI, string memory socialURI, uint16 curveS) =
            abi.decode(tokenCreated.data, (address, string, string, uint16));
        assertTrue(router != address(0));
        assertEq(metadataURI, "ipfs://event");
        assertEq(socialURI, "https://event.example");
        assertEq(curveS, 25);
    }

    function test_BuySellAndFeeClaimEmitExpectedEvents() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        BuyQuote memory buyQuote = hook.quoteBuy(1e18);

        vm.deal(trader, 1e18);
        vm.expectEmit(true, true, true, true, address(hook));
        emit Bought(
            address(token),
            trader,
            recipient,
            buyQuote.grossOkbIn,
            buyQuote.fee,
            buyQuote.tokensOut,
            buyQuote.oldOkbCum,
            buyQuote.newOkbCum
        );

        vm.prank(trader);
        uint256 tokensOut = router.buy{value: 1e18}(address(token), buyQuote.tokensOut, recipient);

        vm.roll(block.number + 1);
        SellQuote memory sellQuote = hook.quoteSell(tokensOut / 2);

        vm.startPrank(recipient);
        token.approve(address(router), tokensOut / 2);
        vm.expectEmit(true, true, true, true, address(hook));
        emit Sold(
            address(token),
            recipient,
            trader,
            tokensOut / 2,
            sellQuote.grossOkbOut,
            sellQuote.fee,
            sellQuote.netOkbOut,
            sellQuote.oldOkbCum,
            sellQuote.newOkbCum
        );
        router.sell(address(token), tokensOut / 2, sellQuote.netOkbOut, trader);
        vm.stopPrank();

        uint256 claimableFees = hook.claimableFeeOkb();
        vm.prank(feeRecipient);
        vm.expectEmit(true, false, false, true, address(hook));
        emit FeesClaimed(recipient, claimableFees);
        hook.claimFees(recipient);
    }

    function test_MigrationEmitsPoolAndLiquidityEvents() public {
        (EulrToken token, EulrHook hook, EulrRouter router) = createDemoToken();
        for (uint256 i = 0; i < 47; i++) {
            vm.roll(i + 2);
            buy(router, token, trader, 10e18);
        }

        uint256 okbAmount = address(hook).balance - hook.claimableFeeOkb();
        uint256 tokenAmount = hook.getCurveParams().k - token.totalSupply();
        address pool = migrationTarget.pool();
        uint256 liquidity = migrationTarget.liquidity();

        vm.expectEmit(true, true, false, true, address(hook));
        emit LiquidityMigrated(address(token), pool, okbAmount, tokenAmount);
        vm.expectEmit(true, true, false, true, address(hook));
        emit LiquidityMigrationResult(address(token), pool, liquidity);
        hook.migrateLiquidity("migration-data");
    }
}
