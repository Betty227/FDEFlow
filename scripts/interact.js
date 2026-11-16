const hre = require("hardhat");

async function main() {
  const address = process.env.FDEFLOW_CONTRACT_ADDRESS;
  if (!address || !hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error("Set FDEFLOW_CONTRACT_ADDRESS to the deployed FDEFlowEscrow address.");
  }

  const escrow = await hre.ethers.getContractAt("FDEFlowEscrow", address);
  const network = await hre.ethers.provider.getNetwork();
  console.log(`Contract: ${address}`);
  console.log(`Network: ${hre.network.name} (${network.chainId})`);
  console.log(`Next project ID: ${await escrow.nextProjectId()}`);
  console.log(`Escrowed: ${hre.ethers.formatEther(await escrow.totalEscrowed())} ETH`);
  console.log(
    `Pending withdrawals: ${hre.ethers.formatEther(await escrow.totalPendingWithdrawals())} ETH`
  );

  if (process.env.PROJECT_ID) {
    const project = await escrow.getProject(process.env.PROJECT_ID);
    console.log("Project record:");
    console.log(project);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
