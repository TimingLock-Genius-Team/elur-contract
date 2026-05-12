// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadTestBase} from "../helpers/SatpadTestBase.sol";
import {BuyQuote, SellQuote} from "../../src/curve/CurveTypes.sol";
import {SatpadHook} from "../../src/hook/SatpadHook.sol";
import {SatpadRouter} from "../../src/router/SatpadRouter.sol";
import {SatpadToken} from "../../src/token/SatpadToken.sol";

contract EventEmissionTest is SatpadTestBase {
    event TokenCreated(
        address indexed token,
        address indexed hook,
        address indexed router,
        address creator,
        string metadataURI,
        string socialURI
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

    function test_CreateTokenEmitsMetadataAndSocialUri() public {
        vm.expectEmit(false, false, false, true, address(factory));
        emit TokenCreated(address(0), address(0), address(0), creator, "ipfs://event", "https://event.example");

        vm.prank(creator);
        factory.createToken("Event", "EVT", "ipfs://event", "https://event.example");
    }

    function test_BuySellAndFeeClaimEmitExpectedEvents() public {
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();
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
        (SatpadToken token, SatpadHook hook, SatpadRouter router) = createDemoToken();
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
