const hre = require("hardhat");

async function main() {
  const address = process.env.FDEFLOW_CONTRACT_ADDRESS;
  if (!address || !hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error("Set FDEFLOW_CONTRACT_ADDRESS to the deployed FDEFlowEscrow address.");
  }

  console.log(`Verifying FDEFlowEscrow at ${address} on ${hre.network.name}`);
  await hre.run("verify:verify", {
    address,
    constructorArguments: [],
  });
  console.log(`Verified URL: https://sepolia.etherscan.io/address/${address}#code`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
