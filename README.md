# FDEFlow

**A Smart Contract Escrow for AI Workflow Delivery and Client Acceptance**

FDEFlow is a CSIT5760 individual project by **HU Wenqi**. It implements a role-controlled Solidity escrow for a single-milestone AI workflow engagement. A client deposits Sepolia test ETH, a provider records delivery and evidence hashes, and a nominated arbiter resolves disputes using any provider share from 0 to 10,000 basis points. Sensitive prompts, files, business data, and complete evidence remain off-chain.

[![FDEFlow CI](https://github.com/Betty227/FDEFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/Betty227/FDEFlow/actions/workflows/ci.yml)

The student ID is intentionally omitted from this public repository. It is included in the course submission package and final report.

> Educational prototype only. Do not use it with real funds or confidential information.

## Why blockchain

The intended scenario involves independent client, provider, and arbiter organisations. The contract gives them a shared and tamper-resistant record of funding, versions, deadlines, decisions, and settlement without allowing either commercial party to rewrite the audit history. Blockchain does not determine whether an AI workflow is good; the contract enforces permissions, timing, and settlement after human review.

## Implemented roles

| Role | Permissions |
| --- | --- |
| Client | Create and fund a project, approve or reject a delivery, propose or approve an extension, mark delivery overdue, open the corresponding dispute, and withdraw refunds. |
| Provider | Submit one delivery and one permitted resubmission, propose or approve an extension, mark review overdue, dispute rejection/review delay, and withdraw payment. |
| Arbiter | Resolve a disputed project with a provider share from 0 to 10,000 basis points. |

Roles are stored per project. There is no global administrator who can redirect escrowed funds.

## Lifecycle

```text
Funded ──submit──> Submitted ──approve──> Resolved
   │                  │
   │                  ├─reject first delivery─> Rejected ──resubmit─> Submitted
   │                  └─review timeout────────> ReviewOverdue ─┐
   └─delivery timeout─────────────────────────> DeliveryOverdue ├─> Disputed
                         Rejected ──provider dispute─────────────┘

Disputed ──arbiter allocation──> Resolved
                                 ├─ 0% provider: full client refund
                                 ├─ 1–99.99%: partial settlement
                                 └─ 100% provider: full provider payment
```

The client may dispute an unacceptable second submission directly. Deadline extensions are pending proposals rather than lifecycle states and take effect only when the other commercial party approves them.

## Security design

- Per-project caller checks enforce client, provider, and arbiter permissions.
- Explicit enum checks prevent state skipping, duplicate settlement, and post-resolution actions.
- Delivery and review boundaries are defined as allowed at the deadline and overdue only after it.
- Pull payments isolate recipients that reject Ether.
- Checks-effects-interactions and OpenZeppelin `ReentrancyGuard` protect withdrawals.
- OpenZeppelin `Math.mulDiv` calculates the provider share; the exact rounding remainder goes to the client.
- Aggregate `totalEscrowed` and `totalPendingWithdrawals` values support accounting checks.
- Only non-sensitive hashes and metadata are stored on-chain.

See [`audit/SECURITY_REVIEW.md`](audit/SECURITY_REVIEW.md) for Slither findings, manual interpretation, remediation status, and residual risks.

## Technology and exact versions

| Component | Version / setting |
| --- | --- |
| Solidity | 0.8.24 |
| Hardhat | 2.28.0 |
| Hardhat Toolbox | 6.1.0 |
| OpenZeppelin Contracts | 5.4.0 |
| solidity-coverage | 0.8.16 |
| Slither | 0.11.4 |
| Optimizer | enabled, 200 runs |
| EVM target | Paris |
| Public network | Sepolia, chain ID 11155111 |

## Live Sepolia deployment

The current contract is deployed and source-verified on Sepolia:

| Item | Public record |
| --- | --- |
| Contract | [`0x83d919208D5e4711Bb72Fd643c4EfF5becCf3Fa7`](https://sepolia.etherscan.io/address/0x83d919208D5e4711Bb72Fd643c4EfF5becCf3Fa7#code) |
| Deployment transaction | [`0x4393f3ce...f46eb390`](https://sepolia.etherscan.io/tx/0x4393f3ce67d91470f4b88238621aaa399b1725409f9d82902050b4f8f46eb390) |
| Deployer/client | [`0x1e0B9652...1f357845`](https://sepolia.etherscan.io/address/0x1e0B96525b19b4E0Ac6A480FA0080D971f357845) |
| Block | `12182782` |
| Source verification | Successful |

An end-to-end Project 1 demonstration also ran on Sepolia. It created a `0.002 ETH` escrow, recorded delivery and rejection hashes, opened a provider dispute, resolved it at `6,000` basis points to the provider, and completed both pull-payment withdrawals. The final state is `Resolved`; `totalEscrowed` and `totalPendingWithdrawals` are both zero.

| Demonstrated transition | Transaction |
| --- | --- |
| Create and fund | [`0xdf3f9736...521f87e`](https://sepolia.etherscan.io/tx/0xdf3f973659ca366ca752863302f6c85b927484c23d4330d66e90ed0a2521f87e) |
| Provider submission | [`0x2364ac1b...d683f74`](https://sepolia.etherscan.io/tx/0x2364ac1bebedd1a778d4d0e2faab3ee64897d50e1f0e6457e41683365d683f74) |
| Client rejection | [`0xd2dee22e...2eff4f`](https://sepolia.etherscan.io/tx/0xd2dee22ed5140dfa85b9b0cb8387d4cd69825461554dd32f2e4eeb7e732eff4f) |
| Provider dispute | [`0xebe2c24b...8418f7`](https://sepolia.etherscan.io/tx/0xebe2c24ba600a7ed36d2f0e86d277b0bd62d67c20b4a61018e5221be068418f7) |
| 60/40 arbitration | [`0xff5d1e06...0c335a`](https://sepolia.etherscan.io/tx/0xff5d1e06355371c52cf33f929a7fe5becae03ca108c8708971ce40f88d0c335a) |
| Provider withdrawal | [`0x004b9af1...53a71`](https://sepolia.etherscan.io/tx/0x004b9af1567068439ed2956e132beec3308cfd83b46841280640ccdb45b53a71) |
| Client withdrawal | [`0x8909da47...9e155`](https://sepolia.etherscan.io/tx/0x8909da47e6b551bd7e75dc4eb00ed62d0ecd4d376f29be50a0d40636a919e155) |

Machine-readable evidence is retained in [`deployment/sepolia-deployment.json`](deployment/sepolia-deployment.json) and [`deployment/sepolia-demo.json`](deployment/sepolia-demo.json).

Use an even-numbered Node.js LTS release supported by Hardhat (Node.js 22 LTS is recommended). Node.js 25 produces a Hardhat support warning and should not be used for the final reproducibility run.

## Repository structure

```text
contracts/FDEFlowEscrow.sol                       application contract
contracts/test/MaliciousWithdrawalReceiver.sol  security test helper
test/FDEFlowEscrow.test.js                       automated test suite
scripts/deploy.js                                deployment and metadata capture
scripts/verify.js                                Etherscan verification
scripts/interact.js                              deployed-state reader
scripts/demo-local.js                            complete local happy-path demo
scripts/demo-sepolia.js                          end-to-end public-testnet demonstration
deployment/                                     generated public deployment records
audit/                                          raw and interpreted security evidence
```

Generated `node_modules`, build artefacts, cache, coverage HTML, virtual environments, and secrets are ignored.

## Prerequisites

- Node.js 22 LTS and npm;
- Python 3 and a project virtual environment for Slither;
- a dedicated Sepolia wallet with a small amount of test ETH;
- a Sepolia RPC endpoint; and
- an Etherscan API key for verification.

Never commit a wallet seed phrase, private key, RPC credential, API key, or populated `.env` file.

## Install

```bash
git clone https://github.com/Betty227/FDEFlow.git
cd FDEFlow
npm ci
python3 -m venv .venv
.venv/bin/pip install slither-analyzer==0.11.4
```

`package-lock.json` locks JavaScript dependencies. Slither is installed locally in `.venv`, which is ignored by Git.

## Compile and test

```bash
npm run compile
npm test
npm run coverage
```

The current suite contains positive, negative, authorization, state, event, deadline-boundary, allocation, rounding, denial-of-service, and reentrancy cases. The latest local run passes 33 tests. Coverage results are written to `coverage/`; the concise console record is retained in `audit/coverage-output.txt`.

Run the complete local success path with:

```bash
npm run demo:local
```

## Security analysis

```bash
npm run security
npm audit --omit=dev
```

Slither output is saved in `audit/slither-output.txt`. Tool output must be interpreted; a raw report alone is not a security conclusion. The current application findings are intentional timestamp comparisons and the controlled low-level call used by the pull-payment withdrawal.

## Configure Sepolia

Copy the example without committing the result:

```bash
cp .env.example .env
```

Populate these local values:

```dotenv
SEPOLIA_RPC_URL=...
DEPLOYER_PRIVATE_KEY=...
ETHERSCAN_API_KEY=...
FDEFLOW_CONTRACT_ADDRESS=...
```

Use a dedicated test-only wallet. The private key must be the 32-byte hexadecimal key expected by Hardhat and must never be shared or submitted.

## Deploy and verify

```bash
npm run preflight:sepolia
npm run deploy:sepolia
```

The preflight command checks that the endpoint reports Sepolia chain ID `11155111`, the private key has the required format, the derived wallet has test ETH, and an Etherscan key is present. It prints the public wallet address but never the key.

The script prints the address and transaction hash and creates `deployment/sepolia-deployment.json` containing:

- network and chain ID;
- contract and deployer addresses;
- deployment transaction hash and block number;
- UTC deployment time;
- compiler, optimizer, and EVM settings;
- source Git commit and deployed-bytecode hash; and
- direct Etherscan URL.

After Etherscan indexes the transaction, set `FDEFLOW_CONTRACT_ADDRESS` in `.env` and run:

```bash
npm run verify:sepolia
npm run interact:sepolia
```

After successful verification, the verification script marks `deployment/sepolia-deployment.json` as verified and records the verified URL and verification time.

To run the public-testnet dispute and partial-settlement demonstration against the configured deployment:

```bash
npm run demo:sepolia
```

The script records only public addresses and transactions in `deployment/sepolia-demo.json`. Temporary role keys are held in a Git-ignored local recovery file only while the run is active, then deleted after all residual test ETH is returned to the deployer.

To print a particular project record:

```bash
PROJECT_ID=1 npm run interact:sepolia
```

## Main contract interface

| Function | Authorized caller | Purpose |
| --- | --- | --- |
| `createProject(...)` | Client / project creator | Fund a new escrow and record scope, acceptance, roles, and deadlines. |
| `submitDelivery(...)` | Provider | Record delivery and evidence hashes; supports one resubmission. |
| `approveDelivery(projectId)` | Client | Resolve with 100% credited to the provider. |
| `rejectDelivery(projectId, reasonHash)` | Client | Reject the first delivery and open a resubmission window. |
| `proposeExtension(...)` | Client or provider | Propose a later active deadline. |
| `approveExtension(projectId)` | Other commercial party | Apply the pending extension. |
| `markDeliveryOverdue(projectId)` | Client | Record a missed delivery/resubmission deadline. |
| `markReviewOverdue(projectId)` | Provider | Record a missed client review deadline. |
| `openDispute(...)` | Context-dependent affected party | Submit a dispute evidence hash and enter arbitration. |
| `resolveDispute(...)` | Arbiter | Allocate 0–10,000 basis points to the provider and the remainder to the client. |
| `withdraw()` | Credited client/provider | Pull all caller credit using a reentrancy-protected transfer. |

View functions expose project records, pending extensions, pending withdrawals, the next ID, and aggregate accounted balance.

## Known limitations

- The contract cannot evaluate AI workflow quality or determine responsibility automatically.
- Evidence contents and arbitration remain off-chain.
- Only one milestone and at most one resubmission are supported.
- Role addresses cannot be rotated if a key is lost or compromised.
- There is no appeal, emergency pause, upgrade path, token payment, or production front end.
- Ether forced into the contract outside `createProject` is not attributed and cannot be recovered.
- Public hashes may confirm guesses about known files, so sensitive or low-entropy content still needs careful off-chain handling.

## Third-party code and AI assistance

The contract imports OpenZeppelin Contracts 5.4.0 `ReentrancyGuard` and `Math`; these components were selected for reviewed reentrancy protection and full-precision multiplication/division. Hardhat, ethers, solidity-coverage, and Slither are development tools and are not application contracts.

AI assistance was used for proposal/report structuring, implementation support, test design, and documentation review. The student remains responsible for verifying, understanding, demonstrating, and explaining every submitted artefact.

## License

The application source is marked `UNLICENSED`. All rights are reserved unless the author later selects a license.
