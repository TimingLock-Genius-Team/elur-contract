// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {EulrFactory} from "../src/factory/EulrFactory.sol";
import {EulrHook} from "../src/hook/EulrHook.sol";
import {EulrRouter} from "../src/router/EulrRouter.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract LocalExternalDependency {
    receive() external payable {}
}

contract LocalMigrationTarget {
    address public immutable pool = address(0xBEEF);
    uint256 public immutable liquidity = 1e18;

    event Migrated(address token, uint256 okbAmount, uint256 tokenAmount, bytes migrationData);

    function migrate(address token, uint256 okbAmount, uint256 tokenAmount, bytes calldata migrationData)
        external
        payable
        returns (address, uint256)
    {
        require(msg.value == okbAmount, "wrong value");
        emit Migrated(token, okbAmount, tokenAmount, migrationData);
        return (pool, liquidity);
    }
}

contract LocalDeployFactory is Script {
    bytes32 internal constant ERC1967_ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    function run() external returns (EulrFactory factory) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address feeRecipient = vm.envOr("TEAM_MULTISIG", deployer);

        vm.startBroadcast(deployerKey);
        LocalMigrationTarget migrationTarget = new LocalMigrationTarget();
        EulrHook hookImplementation = new EulrHook();
        EulrRouter routerImplementation = new EulrRouter();
        EulrFactory factoryImplementation = new EulrFactory();
        TransparentUpgradeableProxy factoryProxy = new TransparentUpgradeableProxy(
            address(factoryImplementation),
            deployer,
            abi.encodeCall(
                EulrFactory.initialize,
                (feeRecipient, address(migrationTarget), address(routerImplementation), deployer, deployer)
            )
        );
        factory = EulrFactory(address(factoryProxy));
        factory.setHookImplementation(address(hookImplementation));
        vm.stopBroadcast();
        address proxyAdmin = _proxyAdmin(address(factoryProxy));

        console2.log("chainId", block.chainid);
        console2.log("factory", address(factory));
        console2.log("proxyAdmin", proxyAdmin);
        console2.log("factoryImplementation", address(factoryImplementation));
        console2.log("hookImplementation", address(hookImplementation));
        console2.log("routerImplementation", address(routerImplementation));
        console2.log("feeRecipient", feeRecipient);
        console2.log("migrationTarget", address(migrationTarget));
    }

    function _proxyAdmin(address proxy) internal view returns (address) {
        return address(uint160(uint256(vm.load(proxy, ERC1967_ADMIN_SLOT))));
    }
}
