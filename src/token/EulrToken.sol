// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract EulrToken is ERC20 {
    address public immutable factory;
    address public hook;

    error OnlyFactory();
    error OnlyHook();
    error HookAlreadySet();
    error ZeroAddress();

    constructor(string memory name_, string memory symbol_, address factory_) ERC20(name_, symbol_) {
        if (factory_ == address(0)) {
            revert ZeroAddress();
        }

        factory = factory_;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) {
            revert OnlyFactory();
        }
        _;
    }

    modifier onlyHook() {
        if (msg.sender != hook) {
            revert OnlyHook();
        }
        _;
    }

    function setHook(address hook_) external onlyFactory {
        if (hook != address(0)) {
            revert HookAlreadySet();
        }
        if (hook_ == address(0)) {
            revert ZeroAddress();
        }

        hook = hook_;
    }

    function mint(address to, uint256 amount) external onlyHook {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyHook {
        _burn(from, amount);
    }
}
