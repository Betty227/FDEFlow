# FDEFlow

**A Smart Contract Escrow for AI Workflow Delivery and Client Acceptance**

FDEFlow is a CSIT5760 individual project by **HU Wenqi**. It will implement a Solidity escrow for AI workflow delivery projects. A client deposits Sepolia test ETH, a provider submits tamper-evident delivery hashes, and a mutually nominated arbiter resolves disputed outcomes. The contract will enforce role permissions, deadlines, state transitions, and safe settlement while keeping sensitive AI artefacts and business data off-chain.

## Project status

The project is currently at the proposal and design stage. Contract code, tests, deployment records, and verified Etherscan links will be added during implementation. No mainnet or real-money use is intended.

## Why blockchain

FDEFlow targets engagements involving independent client, provider, and arbiter organisations. A shared smart contract provides independently verifiable project states, timestamps, evidence hashes, and settlement rules without allowing either commercial party to rewrite the audit trail. The contract does not judge AI-workflow quality; evidence review and responsibility decisions remain off-chain.

## Roles

| Role | Planned permissions |
| --- | --- |
| Client | Create and fund a project, review a delivery, approve or reject it, request or approve an extension, and open a dispute where permitted. |
| Provider | Submit delivery and evidence hashes, resubmit after rejection, request or approve an extension, and open a review-overdue dispute. |
| Arbiter | Resolve a disputed project using an evidence-based provider share from 0 to 10,000 basis points. |

## Planned lifecycle

```text
Funded -> Submitted -> Accepted -> Resolved
   |           |
   |           +-> Rejected -> resubmission
   |           +-> ReviewOverdue -> Disputed
   +-> DeliveryOverdue -> Disputed

Disputed -> Resolved
            |- full client refund
            |- partial settlement
            `- full provider payment
```

A deadline extension takes effect only after the other commercial party approves it. Resolution credits withdrawable balances rather than pushing Ether directly to recipients.

## Planned smart contract capabilities

- Create and fund an escrow project with named client, provider, and arbiter addresses.
- Anchor scope, acceptance criteria, delivery, rejection, and dispute-evidence hashes.
- Enforce delivery and review deadlines and valid lifecycle transitions.
- Require mutual approval for deadline extensions.
- Resolve disputes with a validated `providerShareBps` value between 0 and 10,000.
- Protect withdrawals using checks-effects-interactions, pull payments, and `ReentrancyGuard`.
- Emit events for significant actions and preserve an auditable project history.

## On-chain and off-chain data

On-chain data will be limited to party addresses, non-sensitive hashes, timestamps, escrow amounts, state, extension proposals, and settlement allocation. AI workflows, prompts, business data, source files, test reports, videos, messages, and complete dispute evidence will remain off-chain.

## Technology stack

| Technology | Planned use |
| --- | --- |
| Solidity 0.8.24 | Smart contract implementation |
| Hardhat 2.x | Compilation, automated testing, and deployment |
| ethers 6.x | Contract deployment and scripted interaction |
| OpenZeppelin Contracts 5.x | `ReentrancyGuard` and reviewed utilities |
| Sepolia | Public Ethereum test network |
| Etherscan | Source-code verification and transaction evidence |
| Slither | Static security analysis |

Exact installed versions will be recorded after the project dependencies are initialized.

## Prerequisites

The completed project will require:

- Node.js and npm;
- a Sepolia-compatible wallet;
- Sepolia test ETH;
- an RPC endpoint for deployment; and
- an Etherscan API key for automated verification, if used.

Credentials must be stored locally in an untracked `.env` file and must never be committed.

## Installation, compilation, and testing

The repository does not yet contain the implementation. After the Hardhat project is initialized, this section will provide reproducible commands similar to:

```bash
npm install
npx hardhat compile
npx hardhat test
```

The final test suite will cover successful workflows, unauthorized calls, invalid inputs, repeated operations, deadline boundaries, state transitions, events, balance conservation, partial settlements, and malicious withdrawal receivers.

## Deployment and verification

Deployment scripts and exact commands will be added under `scripts/` or `deployment/`. The final documentation will record:

- network name and chain ID;
- contract and deployer addresses;
- deployment transaction hash and block number;
- compiler, optimizer, and EVM settings;
- deployment date, tool, and command; and
- direct verified Etherscan URL.

No contract has been deployed yet.

## Contract interaction

Interaction examples will be provided through Hardhat scripts. They will demonstrate project creation and funding, delivery submission, acceptance or rejection, mutually approved extensions, overdue disputes, arbiter resolution, and withdrawals from credited balances.

## Security considerations

The implementation and tests will address at least:

- unauthorized role actions;
- invalid or repeated state transitions;
- reentrancy and duplicate withdrawal;
- invalid or incorrectly rounded settlement shares;
- deadline and timestamp boundary behaviour;
- denial-of-service risks from direct Ether transfers; and
- accidental exposure of sensitive information on-chain.

Slither findings will be interpreted manually, remediated where necessary, and retested. The project will not claim complete security.

## Known limitations

- The contract cannot determine whether an AI workflow is technically good or commercially acceptable.
- Evidence contents and human arbitration remain off-chain.
- The initial version supports one escrow and one delivery milestone per project, using test ETH rather than tokens or NFTs; it does not include multi-milestone billing or appeals.
- The system is an educational prototype and is not suitable for production or real funds.

## Planned repository structure

```text
contracts/      Solidity contracts
test/           Hardhat automated tests
scripts/        Deployment and interaction scripts
deployment/     Testnet deployment metadata
audit/          Security-analysis output and interpreted findings
docs/           Diagrams and supporting documentation
```

## Third-party libraries and assistance

The project plans to use OpenZeppelin Contracts and Hardhat. Exact versions and reused functionality will be documented after installation. AI assistance used for proposal structure, documentation, and development support will be acknowledged in accordance with the course policy; the student remains responsible for understanding and explaining the submitted work.

## License

No license has been selected. All rights are reserved unless a license is added later.
