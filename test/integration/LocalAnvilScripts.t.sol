// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {LocalDeployFactory} from "../../script/LocalDeployFactory.s.sol";
import {CreateTokenAndBuyLocal} from "../../script/CreateTokenAndBuyLocal.s.sol";
import {EulrFactory} from "../../src/factory/EulrFactory.sol";
import {EulrToken} from "../../src/token/EulrToken.sol";

/// @dev Covers `script/LocalDeployFactory.s.sol` and `script/CreateTokenAndBuyLocal.s.sol` (`Script.run` + env)
/// in one test to avoid `vm.setEnv("TEAM_MULTISIG", …)` races when Forge runs tests in parallel.
contract LocalAnvilScriptsTest is Test {
    address internal deployer;

    function setUp() public {
        vm.setEnv("PRIVATE_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
        deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        vm.deal(deployer, 100 ether);
    }

    function test_Scripts_LocalDeployFactory_and_CreateTokenAndBuyLocal() public {
        vm.setEnv("TEAM_MULTISIG", vm.toString(deployer));
        EulrFactory matchDeployer = new LocalDeployFactory().run();
        assertGt(address(matchDeployer).code.length, 0);
        assertEq(matchDeployer.feeRecipient(), deployer);

        address multisig = address(uint160(uint256(keccak256("multisig"))));
        vm.setEnv("TEAM_MULTISIG", vm.toString(multisig));
        EulrFactory matchMultisig = new LocalDeployFactory().run();
        assertEq(matchMultisig.feeRecipient(), multisig);

        vm.setEnv("TEAM_MULTISIG", vm.toString(deployer));
        EulrFactory factory = new LocalDeployFactory().run();

        vm.setEnv("FACTORY", vm.toString(address(factory)));
        vm.setEnv("BUY_WEI", vm.toString(uint256(1 ether)));
        vm.setEnv("CURVE_S", vm.toString(uint256(100)));

        uint256 balanceBefore = deployer.balance;
        new CreateTokenAndBuyLocal().run();

        assertEq(factory.allTokensLength(), 1);
        address tokenAddr = factory.allTokens(0);
        assertGt(EulrToken(tokenAddr).balanceOf(deployer), 0);
        assertLt(deployer.balance, balanceBefore);
    }
}
