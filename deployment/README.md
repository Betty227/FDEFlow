# Deployment records

`scripts/deploy.js` writes `sepolia-deployment.json` after deployment. It records the contract and deployer addresses, transaction hash, block number, UTC timestamp, compiler settings, bytecode hash, source commit, and Etherscan verification URL.

`scripts/demo-sepolia.js` writes `sepolia-demo.json` after the public-testnet workflow. It records the three public role addresses, Project 1 settlement result, and transaction hashes for funding, submission, rejection, dispute, arbitration, withdrawals, and temporary-account cleanup.

Current verified contract: [`0x83d919208D5e4711Bb72Fd643c4EfF5becCf3Fa7`](https://sepolia.etherscan.io/address/0x83d919208D5e4711Bb72Fd643c4EfF5becCf3Fa7#code).

No private key, RPC credential, API key, or `.env` file belongs in this directory.
