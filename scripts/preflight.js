require("dotenv").config();
const { ethers } = require("ethers");

const SEPOLIA_CHAIN_ID = 11155111n;

function requireValue(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is missing from .env`);
  }
  return value.trim();
}

async function main() {
  const rpcUrl = requireValue("SEPOLIA_RPC_URL");
  const privateKey = requireValue("DEPLOYER_PRIVATE_KEY");
  requireValue("ETHERSCAN_API_KEY");

  if (!/^https?:\/\//i.test(rpcUrl)) {
    throw new Error("SEPOLIA_RPC_URL must be an HTTP(S) endpoint");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hexadecimal key");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(
      `RPC chain ID is ${network.chainId}; expected Sepolia chain ID ${SEPOLIA_CHAIN_ID}`
    );
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);
  if (balance === 0n) {
    throw new Error(`Deployment wallet ${wallet.address} has no Sepolia ETH`);
  }

  console.log("Sepolia deployment preflight passed");
  console.log(`Chain ID: ${network.chainId}`);
  console.log(`Deployment wallet: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} Sepolia ETH`);
  console.log("Etherscan API key: present (value not displayed)");
}

main().catch((error) => {
  console.error(`Preflight failed: ${error.message}`);
  process.exitCode = 1;
});
