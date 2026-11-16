const fs = require("fs");
const path = require("path");
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
  const verifiedUrl = `https://sepolia.etherscan.io/address/${address}#code`;
  const recordPath = path.join(__dirname, "..", "deployment", "sepolia-deployment.json");
  if (fs.existsSync(recordPath)) {
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    if (record.address.toLowerCase() !== address.toLowerCase()) {
      throw new Error("FDEFLOW_CONTRACT_ADDRESS does not match the Sepolia deployment record");
    }
    record.verified = true;
    record.verifiedAtUtc = new Date().toISOString();
    record.verifiedUrl = verifiedUrl;
    fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`Updated deployment record: ${recordPath}`);
  }
  console.log(`Verified URL: ${verifiedUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
