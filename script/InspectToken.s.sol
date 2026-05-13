// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EulrScriptBase} from "./EulrScriptBase.s.sol";

contract InspectToken is EulrScriptBase {
    function run() external view {
        _logTokenInfo(_tokenInfo());
    }
}
