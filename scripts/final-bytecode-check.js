const fs = require("fs");
const path = require("path");
const hre = require("hardhat");


async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployment", "sepolia-deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const artifact = await hre.artifacts.readArtifact("FDEFlowEscrow");
  const onChainCode = await hre.ethers.provider.getCode(deployment.address);
  const localHash = hre.ethers.keccak256(artifact.deployedBytecode);
  const onChainHash = hre.ethers.keccak256(onChainCode);

  console.log(`Recorded hash: ${deployment.deployedBytecodeHash}`);
  console.log(`Local artifact hash: ${localHash}`);
  console.log(`On-chain hash: ${onChainHash}`);

  if (onChainCode === "0x") throw new Error("No runtime bytecode at the recorded address");
  if (localHash !== deployment.deployedBytecodeHash || onChainHash !== deployment.deployedBytecodeHash) {
    throw new Error("Runtime bytecode hash mismatch");
  }
  console.log("Bytecode check passed");
}


main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
