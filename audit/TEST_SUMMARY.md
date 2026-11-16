# FDEFlow Test Summary

## Environment and result

- Date: 17 November 2026 (HKT)
- Solidity: 0.8.24, optimizer enabled with 200 runs, Paris EVM
- Hardhat: 2.28.0
- Test runner: Mocha/Chai through Hardhat Toolbox 6.1.0
- Command: `npm test`
- Result: **33 passing, 0 failing**
- Coverage: **100% statements, 88.24% branches, 100% functions, 100% lines** for `FDEFlowEscrow.sol`

The full test names and coverage output are retained in `audit/coverage-output.txt`.

## Representative test cases

| ID | Purpose / precondition | Steps / input | Expected and actual result | Status |
| --- | --- | --- | --- | --- |
| T-01 | Create a valid funded project | Distinct client/provider/arbiter, nonzero hashes, future deadline, 1 ETH | Project 1 stored in `Funded`; event, fields, and aggregate escrow equal inputs. Observed as expected. | Pass |
| T-02 | Reject invalid creation inputs | Zero funding/hash/address, duplicated roles, expired deadline, zero or >90-day review period | Each call reverts with its documented custom error and creates no project. Observed as expected. | Pass |
| T-03 | Enforce provider-only delivery | Unrelated signer calls `submitDelivery`; provider submits valid hashes | Unrelated call reverts; provider call records hashes, increments count, enters `Submitted`, and emits event. Observed as expected. | Pass |
| T-04 | Validate delivery boundary | Submit exactly at `deliveryDeadline`, then in a separate fixture at deadline + 1 second | Exact deadline succeeds; late call reverts with `DeadlinePassed`. Observed as expected. | Pass |
| T-05 | Enforce one resubmission | Client rejects first delivery; provider resubmits; client tries second rejection | First rejection and second submission succeed; repeated rejection reverts with `ResubmissionLimitReached`. Observed as expected. | Pass |
| T-06 | Require mutual deadline extension | Client proposes a later deadline; same client attempts approval; provider approves | Same-party approval reverts; counterparty approval updates the active deadline and clears proposal. Observed as expected. | Pass |
| T-07 | Handle delivery and review timeouts | Call overdue functions before and after deadlines with correct/incorrect roles | Early and wrong-role calls revert; eligible party records the correct overdue state after the deadline. Observed as expected. | Pass |
| T-08 | Restrict dispute initiation | Try disputes from invalid states and wrong roles; affected party supplies evidence hash | Invalid/unauthorized calls revert; eligible client/provider enters `Disputed` and event records prior state. Observed as expected. | Pass |
| T-09 | Enforce arbiter-only settlement | Non-arbiter and arbiter attempt `resolveDispute` | Non-arbiter reverts; arbiter resolves once and repeated resolution reverts. Observed as expected. | Pass |
| T-10 | Validate partial-settlement values | Resolve separate projects at 0%, 20%, 50%, 80%, 100%, and 100.01% | Valid shares credit exact expected amounts; 100.01% reverts. Provider plus client credits always equal escrow. Observed as expected. | Pass |
| T-11 | Validate rounding | Resolve a 101-wei escrow at 33.33% | Provider receives 33 wei and client receives exact remainder of 68 wei; no wei is lost. Observed as expected. | Pass |
| T-12 | Prevent duplicate withdrawal | Approved provider withdraws and calls again | First call emits event and clears credit; second call reverts with `NoPendingWithdrawal`. Observed as expected. | Pass |
| T-13 | Isolate a reverting receiver | Malicious provider rejects Ether in a 50/50 settlement | Its withdrawal reverts and credit remains; client still withdraws independently. Observed as expected. | Pass |
| T-14 | Resist reentrancy | Malicious provider attempts a second withdrawal from `receive()` | Reentrant call fails; only one credit is transferred and pending balance becomes zero. Observed as expected. | Pass |
| T-15 | Preserve accounting invariant | Compare `accountedBalance()` with contract balance before/after resolution | Escrow plus pending credits equals the contract balance in normal flows. Observed as expected. | Pass |

## Evidence interpretation

The tests verify both successful behaviour and required failure behaviour. Event assertions confirm that off-chain observers can reconstruct important actions. Balance assertions confirm conservation through full and partial settlement. Controlled time manipulation validates exact boundary semantics. The malicious receiver demonstrates that pull payments prevent one recipient from blocking another and that reentrant withdrawal cannot duplicate funds.
