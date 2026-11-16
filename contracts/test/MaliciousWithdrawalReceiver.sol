// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

interface IFDEFlowWithdraw {
    function withdraw() external;
}

/// @dev Test helper that can reject Ether or attempt one reentrant withdrawal.
contract MaliciousWithdrawalReceiver {
    IFDEFlowWithdraw public immutable escrow;
    bool public rejectEther;
    bool public attemptReentry;
    bool private _reentryAttempted;

    constructor(address escrowAddress) {
        escrow = IFDEFlowWithdraw(escrowAddress);
    }

    function configure(bool shouldReject, bool shouldReenter) external {
        rejectEther = shouldReject;
        attemptReentry = shouldReenter;
        _reentryAttempted = false;
    }

    function triggerWithdrawal() external {
        escrow.withdraw();
    }

    receive() external payable {
        if (rejectEther) revert("receiver rejects Ether");
        if (attemptReentry && !_reentryAttempted) {
            _reentryAttempted = true;
            try escrow.withdraw() {} catch {}
        }
    }
}
