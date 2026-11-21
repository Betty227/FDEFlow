const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const { ethers } = hre;
const DEPLOYMENT_PATH = path.join(__dirname, "..", "deployment", "sepolia-deployment.json");
const DEMO_PATH = path.join(__dirname, "..", "deployment", "sepolia-demo.json");
const RECOVERY_PATH = path.join(__dirname, "..", ".env.demo-wallets");

async function confirmed(label, transactionPromise) {
  const transaction = await transactionPromise;
  const receipt = await transaction.wait();
  console.log(`${label}: ${transaction.hash}`);
  return { hash: transaction.hash, blockNumber: receipt.blockNumber };
}

async function sweep(wallet, recipient, label) {
  const balance = await ethers.provider.getBalance(wallet.address);
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice;
  if (!gasPrice) throw new Error("Provider did not return a gas price for wallet cleanup");

  const gasCost = 21_000n * gasPrice;
  if (balance <= gasCost) {
    console.log(`${label}: no recoverable balance remains`);
    return null;
  }

  return confirmed(
    label,
    wallet.sendTransaction({
      to: recipient,
      value: balance - gasCost,
      gasLimit: 21_000n,
      gasPrice,
    })
  );
}

async function main() {
  if (!fs.existsSync(DEPLOYMENT_PATH)) {
    throw new Error("Missing deployment/sepolia-deployment.json; deploy the contract first");
  }

  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
  const [client] = await ethers.getSigners();
  const provider = ethers.Wallet.createRandom().connect(ethers.provider);
  const arbiter = ethers.Wallet.createRandom().connect(ethers.provider);

  // This ignored recovery file exists only so a failed demonstration cannot strand
  // test ETH in an unrecoverable temporary account. It is deleted after cleanup.
  fs.writeFileSync(
    RECOVERY_PATH,
    [
      `DEMO_PROVIDER_PRIVATE_KEY=${provider.privateKey}`,
      `DEMO_ARBITER_PRIVATE_KEY=${arbiter.privateKey}`,
      "",
    ].join("\n"),
    { mode: 0o600 }
  );

  const escrow = await ethers.getContractAt("FDEFlowEscrow", deployment.address);
  const projectId = await escrow.nextProjectId();
  const latestBlock = await ethers.provider.getBlock("latest");
  const deliveryDeadline = latestBlock.timestamp + 24 * 60 * 60;
  const reviewPeriod = 60 * 60;
  const escrowAmount = ethers.parseEther("0.002");
  const roleGasFunding = ethers.parseEther("0.0005");

  console.log(`Contract: ${deployment.address}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Client: ${client.address}`);
  console.log(`Provider: ${provider.address}`);
  console.log(`Arbiter: ${arbiter.address}`);

  const transactions = {};
  transactions.fundProvider = await confirmed(
    "Fund temporary provider",
    client.sendTransaction({ to: provider.address, value: roleGasFunding })
  );
  transactions.fundArbiter = await confirmed(
    "Fund temporary arbiter",
    client.sendTransaction({ to: arbiter.address, value: roleGasFunding })
  );

  transactions.createProject = await confirmed(
    "Create funded project",
    escrow.createProject(
      provider.address,
      arbiter.address,
      ethers.id("FDEFlow Sepolia demo scope v1"),
      ethers.id("FDEFlow Sepolia demo acceptance criteria v1"),
      deliveryDeadline,
      reviewPeriod,
      { value: escrowAmount }
    )
  );

  transactions.submitDelivery = await confirmed(
    "Submit delivery",
    escrow
      .connect(provider)
      .submitDelivery(
        projectId,
        ethers.id("FDEFlow Sepolia demo delivery bundle v1"),
        ethers.id("FDEFlow Sepolia demo test report v1")
      )
  );

  transactions.rejectDelivery = await confirmed(
    "Reject first delivery",
    escrow.rejectDelivery(projectId, ethers.id("Acceptance test 3 requires correction"))
  );

  transactions.openDispute = await confirmed(
    "Open provider dispute",
    escrow
      .connect(provider)
      .openDispute(projectId, ethers.id("FDEFlow Sepolia demo dispute evidence v1"))
  );

  transactions.resolveDispute = await confirmed(
    "Resolve dispute at 60/40",
    escrow.connect(arbiter).resolveDispute(projectId, 6000)
  );

  const providerCredit = await escrow.pendingWithdrawalOf(provider.address);
  const clientCredit = await escrow.pendingWithdrawalOf(client.address);
  transactions.providerWithdrawal = await confirmed(
    "Provider withdraws 60%",
    escrow.connect(provider).withdraw()
  );
  transactions.clientWithdrawal = await confirmed(
    "Client withdraws 40%",
    escrow.withdraw()
  );

  transactions.providerSweep = await sweep(provider, client.address, "Recover provider test ETH");
  transactions.arbiterSweep = await sweep(arbiter, client.address, "Recover arbiter test ETH");

  const project = await escrow.getProject(projectId);
  const record = {
    network: "sepolia",
    chainId: "11155111",
    contract: deployment.address,
    projectId: projectId.toString(),
    roles: {
      client: client.address,
      provider: provider.address,
      arbiter: arbiter.address,
    },
    escrowAmountWei: escrowAmount.toString(),
    providerShareBps: Number(project.providerShareBps),
    providerCreditWei: providerCredit.toString(),
    clientCreditWei: clientCredit.toString(),
    finalState: Number(project.state),
    transactions,
    completedAtUtc: new Date().toISOString(),
  };
  fs.writeFileSync(DEMO_PATH, `${JSON.stringify(record, null, 2)}\n`);
  fs.unlinkSync(RECOVERY_PATH);

  console.log(`Final project state: ${project.state} (Resolved)`);
  console.log(`Provider allocation: ${ethers.formatEther(providerCredit)} ETH`);
  console.log(`Client allocation: ${ethers.formatEther(clientCredit)} ETH`);
  console.log(`Demo record: ${DEMO_PATH}`);
  console.log("Temporary wallet recovery file removed after successful cleanup");
}

main().catch((error) => {
  console.error(error);
  if (fs.existsSync(RECOVERY_PATH)) {
    console.error(`Recovery keys retained locally at ${RECOVERY_PATH}; do not commit or share this file.`);
  }
  process.exitCode = 1;
});
