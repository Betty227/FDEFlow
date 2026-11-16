const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const startingBalance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`Deploying FDEFlowEscrow from ${deployer.address}`);
  console.log(`Network: ${hre.network.name} (${network.chainId})`);
  console.log(`Deployer balance: ${hre.ethers.formatEther(startingBalance)} ETH`);

  const Factory = await hre.ethers.getContractFactory("FDEFlowEscrow");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();
  const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
  const deployedBytecode = await hre.ethers.provider.getCode(address);
  let sourceCommit = "unavailable";
  try {
    sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
    }).trim();
  } catch (_) {
    // Deployment can still proceed outside a Git checkout.
  }

  const record = {
    contract: "FDEFlowEscrow",
    address,
    network: hre.network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    deploymentTransactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    deployedAtUtc: new Date(Number(block.timestamp) * 1000).toISOString(),
    compiler: "0.8.24",
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    constructorArguments: [],
    sourceCommit,
    deployedBytecodeHash: hre.ethers.keccak256(deployedBytecode),
    verified: false,
    etherscanUrl:
      network.chainId === 11155111n ? `https://sepolia.etherscan.io/address/${address}` : null,
  };

  const outputDir = path.join(__dirname, "..", "deployment");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${hre.network.name}-deployment.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`FDEFlowEscrow deployed at ${address}`);
  console.log(`Transaction: ${receipt.hash}`);
  console.log(`Deployment record: ${outputPath}`);
  if (record.etherscanUrl) console.log(`Etherscan: ${record.etherscanUrl}`);
  console.log("Run the verification script after Etherscan has indexed the deployment.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
