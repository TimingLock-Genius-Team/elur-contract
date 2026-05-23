// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract EulrV4SellTaxHookDeployer {
    error Create2DeployFailed();

    event Deployed(address indexed deployed, bytes32 indexed salt);

    function deploy(bytes32 salt, bytes calldata initCode) external returns (address deployed) {
        bytes memory code = initCode;
        assembly ("memory-safe") {
            deployed := create2(0, add(code, 0x20), mload(code), salt)
        }
        if (deployed == address(0)) revert Create2DeployFailed();
        emit Deployed(deployed, salt);
    }
}
