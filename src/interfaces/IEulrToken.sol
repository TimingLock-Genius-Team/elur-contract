// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IEulrToken is IERC20 {
    function hook() external view returns (address);
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}
