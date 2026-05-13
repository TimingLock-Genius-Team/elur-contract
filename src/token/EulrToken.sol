// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract EulrToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    address public immutable factory;
    address public hook;
    uint256 public totalSupply;

    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 allowance)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error OnlyFactory();
    error OnlyHook();
    error HookAlreadySet();
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(string memory name_, string memory symbol_, address factory_) {
        if (factory_ == address(0)) {
            revert ZeroAddress();
        }

        name = name_;
        symbol = symbol_;
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

    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) {
            revert ZeroAddress();
        }

        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) {
            revert InsufficientAllowance();
        }

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowed - amount);
        }

        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external onlyHook {
        if (to == address(0)) {
            revert ZeroAddress();
        }

        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyHook {
        uint256 balance = balanceOf[from];
        if (balance < amount) {
            revert InsufficientBalance();
        }

        unchecked {
            balanceOf[from] = balance - amount;
            totalSupply -= amount;
        }
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) {
            revert ZeroAddress();
        }

        uint256 balance = balanceOf[from];
        if (balance < amount) {
            revert InsufficientBalance();
        }

        unchecked {
            balanceOf[from] = balance - amount;
            balanceOf[to] += amount;
        }

        emit Transfer(from, to, amount);
    }
}
