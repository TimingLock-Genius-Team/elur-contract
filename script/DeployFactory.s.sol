// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Curve} from "../src/curve/Curve.sol";
import {CurveParams} from "../src/curve/CurveTypes.sol";
import {EulrFactory} from "../src/factory/EulrFactory.sol";

contract DeployFactory is Script {
    using stdJson for string;

    error MissingDeploymentMetadata(string envName);

    struct DeploymentRecord {
        address deployer;
        address factory;
        address feeRecipient;
        address poolManager;
        address positionManager;
        address migrationTarget;
    }

    function run() external returns (EulrFactory factory) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address feeRecipient = vm.envAddress("TEAM_MULTISIG");
        address poolManager = vm.envAddress("UNISWAP_V4_POOL_MANAGER");
        address positionManager = vm.envAddress("UNISWAP_V4_POSITION_MANAGER");
        address migrationTarget = vm.envAddress("MIGRATION_TARGET");

        _requireCode("UNISWAP_V4_POOL_MANAGER", poolManager);
        _requireCode("UNISWAP_V4_POSITION_MANAGER", positionManager);
        _requireCode("MIGRATION_TARGET", migrationTarget);

        vm.startBroadcast(deployerKey);
        factory = new EulrFactory(feeRecipient, migrationTarget);
        vm.stopBroadcast();

        _writeDeploymentJson(
            DeploymentRecord({
                deployer: deployer,
                factory: address(factory),
                feeRecipient: feeRecipient,
                poolManager: poolManager,
                positionManager: positionManager,
                migrationTarget: migrationTarget
            })
        );

        console2.log("chainId", block.chainid);
        console2.log("deployer", deployer);
        console2.log("factory", address(factory));
        console2.log("feeRecipient", feeRecipient);
        console2.log("uniswapV4PoolManager", poolManager);
        console2.log("uniswapV4PositionManager", positionManager);
        console2.log("migrationTarget", migrationTarget);
    }

    function _requireCode(string memory label, address target) internal view {
        if (target.code.length == 0) {
            revert(string.concat(label, " has no code"));
        }
    }

    function _writeDeploymentJson(DeploymentRecord memory record) internal {
        string memory network = vm.envOr("DEPLOYMENT_NETWORK", string("xlayer"));
        string memory commit = _requiredString("GIT_COMMIT");
        string memory deployedAt = _requiredString("DEPLOYED_AT");

        string memory json = _serializeDeployment(record, commit, deployedAt, _serializeCurve());

        string memory directory = string.concat("deployments/", network);
        vm.createDir(directory, true);
        json.write(string.concat(directory, "/latest.json"));
    }

    function _requiredString(string memory envName) internal view returns (string memory value) {
        value = vm.envOr(envName, string(""));
        if (bytes(value).length == 0) {
            revert MissingDeploymentMetadata(envName);
        }
    }

    function _serializeCurve() internal returns (string memory curveJson) {
        CurveParams memory params = Curve.defaultParams();

        string memory curve = "curve";
        curve.serialize("k", vm.toString(params.k));
        curve.serialize("s", vm.toString(params.s));
        curve.serialize("feeBps", params.feeBps);
        curve.serialize("selfDeprecationBps", params.selfDeprecationBps);
        curveJson = curve.serialize("maxBuyOkb", vm.toString(params.maxBuyOkb));
    }

    function _serializeDeployment(
        DeploymentRecord memory record,
        string memory commit,
        string memory deployedAt,
        string memory curveJson
    ) internal returns (string memory json) {
        string[] memory createdTokens = new string[](0);

        string memory deployment = "deployment";
        deployment.serialize("chainId", block.chainid);
        deployment.serialize("commit", commit);
        deployment.serialize("deployedAt", deployedAt);
        deployment.serialize("deployer", record.deployer);
        deployment.serialize("factory", record.factory);
        deployment.serialize("feeRecipient", record.feeRecipient);
        deployment.serialize("uniswapV4PoolManager", record.poolManager);
        deployment.serialize("uniswapV4PositionManager", record.positionManager);
        deployment.serialize("migrationTarget", record.migrationTarget);
        deployment.serialize("curve", curveJson);
        json = deployment.serialize("createdTokens", createdTokens);
    }
}
