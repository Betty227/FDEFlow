const hre = require("hardhat");

async function main() {
  const [client, provider, arbiter] = await hre.ethers.getSigners();
  const Factory = await hre.ethers.getContractFactory("FDEFlowEscrow");
  const escrow = await Factory.deploy();
  await escrow.waitForDeployment();

  const latest = await hre.ethers.provider.getBlock("latest");
  const deliveryDeadline = latest.timestamp + 24 * 60 * 60;
  const reviewPeriod = 60 * 60;
  const amount = hre.ethers.parseEther("1");

  console.log(`Local contract: ${escrow.target}`);
  console.log(`Client: ${client.address}`);
  console.log(`Provider: ${provider.address}`);
  console.log(`Arbiter: ${arbiter.address}`);

  await (
    await escrow
      .connect(client)
      .createProject(
        provider.address,
        arbiter.address,
        hre.ethers.id("sample scope v1"),
        hre.ethers.id("sample acceptance criteria v1"),
        deliveryDeadline,
        reviewPeriod,
        { value: amount }
      )
  ).wait();
  console.log("Project 1 created and funded with 1 test ETH");

  await (
    await escrow
      .connect(provider)
      .submitDelivery(
        1,
        hre.ethers.id("sample delivery bundle v1"),
        hre.ethers.id("sample test report v1")
      )
  ).wait();
  console.log("Provider submitted delivery and evidence hashes");

  await (await escrow.connect(client).approveDelivery(1)).wait();
  console.log("Client approved; provider received a withdrawable credit");

  const credit = await escrow.pendingWithdrawalOf(provider.address);
  console.log(`Provider credit: ${hre.ethers.formatEther(credit)} ETH`);
  await (await escrow.connect(provider).withdraw()).wait();
  console.log("Provider withdrew successfully; demo complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
