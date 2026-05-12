// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SatpadScriptBase} from "./SatpadScriptBase.s.sol";

contract InspectToken is SatpadScriptBase {
    function run() external view {
        _logTokenInfo(_tokenInfo());
    }
}
