const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("FDEFlowEscrow", function () {
  const DAY = 24 * 60 * 60;
  const HOUR = 60 * 60;
  const ESCROW = ethers.parseEther("1");
  const SCOPE_HASH = ethers.id("scope-v1");
  const ACCEPTANCE_HASH = ethers.id("acceptance-v1");
  const DELIVERY_HASH = ethers.id("delivery-v1");
  const DELIVERY_2_HASH = ethers.id("delivery-v2");
  const EVIDENCE_HASH = ethers.id("evidence-v1");
  const DISPUTE_HASH = ethers.id("dispute-evidence-v1");
  const REJECTION_HASH = ethers.id("missing acceptance test");

  const State = {
    None: 0n,
    Funded: 1n,
    Submitted: 2n,
    Rejected: 3n,
    DeliveryOverdue: 4n,
    ReviewOverdue: 5n,
    Disputed: 6n,
    Resolved: 7n,
  };

  async function deployFixture() {
    const [client, provider, arbiter, outsider, other] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("FDEFlowEscrow");
    const escrow = await Escrow.deploy();
    await escrow.waitForDeployment();
    return { escrow, client, provider, arbiter, outsider, other };
  }

  async function fundedFixture() {
    const fixture = await deployFixture();
    const now = await time.latest();
    const deliveryDeadline = now + DAY;
    await fixture.escrow
      .connect(fixture.client)
      .createProject(
        fixture.provider.address,
        fixture.arbiter.address,
        SCOPE_HASH,
        ACCEPTANCE_HASH,
        deliveryDeadline,
        HOUR,
        { value: ESCROW }
      );
    return { ...fixture, projectId: 1n, deliveryDeadline };
  }

  async function submittedFixture() {
    const fixture = await fundedFixture();
    await fixture.escrow
      .connect(fixture.provider)
      .submitDelivery(fixture.projectId, DELIVERY_HASH, EVIDENCE_HASH);
    const project = await fixture.escrow.getProject(fixture.projectId);
    return { ...fixture, reviewDeadline: Number(project.reviewDeadline) };
  }

  async function rejectedFixture() {
    const fixture = await submittedFixture();
    await fixture.escrow
      .connect(fixture.client)
      .rejectDelivery(fixture.projectId, REJECTION_HASH);
    const project = await fixture.escrow.getProject(fixture.projectId);
    return { ...fixture, resubmissionDeadline: Number(project.deliveryDeadline) };
  }

  async function deliveryDisputeFixture() {
    const fixture = await fundedFixture();
    await time.increaseTo(fixture.deliveryDeadline + 1);
    await fixture.escrow.connect(fixture.client).markDeliveryOverdue(fixture.projectId);
    await fixture.escrow.connect(fixture.client).openDispute(fixture.projectId, DISPUTE_HASH);
    return fixture;
  }

  describe("project creation", function () {
    it("creates an isolated funded project and records its audit fields", async function () {
      const { escrow, client, provider, arbiter, projectId, deliveryDeadline } =
        await loadFixture(fundedFixture);

      const project = await escrow.getProject(projectId);
      expect(project.client).to.equal(client.address);
      expect(project.provider).to.equal(provider.address);
      expect(project.arbiter).to.equal(arbiter.address);
      expect(project.amount).to.equal(ESCROW);
      expect(project.scopeHash).to.equal(SCOPE_HASH);
      expect(project.acceptanceCriteriaHash).to.equal(ACCEPTANCE_HASH);
      expect(project.deliveryDeadline).to.equal(deliveryDeadline);
      expect(project.state).to.equal(State.Funded);
      expect(await escrow.totalEscrowed()).to.equal(ESCROW);
      expect(await escrow.accountedBalance()).to.equal(ESCROW);
      expect(await escrow.nextProjectId()).to.equal(2n);
    });

    it("emits a complete ProjectCreated event", async function () {
      const { escrow, client, provider, arbiter } = await loadFixture(deployFixture);
      const deadline = (await time.latest()) + DAY;
      await expect(
        escrow
          .connect(client)
          .createProject(
            provider.address,
            arbiter.address,
            SCOPE_HASH,
            ACCEPTANCE_HASH,
            deadline,
            HOUR,
            { value: ESCROW }
          )
      )
        .to.emit(escrow, "ProjectCreated")
        .withArgs(
          1n,
          client.address,
          provider.address,
          arbiter.address,
          ESCROW,
          deadline,
          HOUR,
          SCOPE_HASH,
          ACCEPTANCE_HASH
        );
    });

    it("rejects zero addresses and duplicated roles", async function () {
      const { escrow, client, provider, arbiter } = await loadFixture(deployFixture);
      const deadline = (await time.latest()) + DAY;

      await expect(
        escrow
          .connect(client)
          .createProject(
            ethers.ZeroAddress,
            arbiter.address,
            SCOPE_HASH,
            ACCEPTANCE_HASH,
            deadline,
            HOUR,
            { value: ESCROW }
          )
      ).to.be.revertedWithCustomError(escrow, "InvalidAddress");

      await expect(
        escrow
          .connect(client)
          .createProject(
            provider.address,
            provider.address,
            SCOPE_HASH,
            ACCEPTANCE_HASH,
            deadline,
            HOUR,
            { value: ESCROW }
          )
      ).to.be.revertedWithCustomError(escrow, "DuplicateRole");

      await expect(
        escrow
          .connect(client)
          .createProject(
            client.address,
            arbiter.address,
            SCOPE_HASH,
            ACCEPTANCE_HASH,
            deadline,
            HOUR,
            { value: ESCROW }
          )
      ).to.be.revertedWithCustomError(escrow, "DuplicateRole");
    });

    it("rejects empty hashes, zero funding, past deadlines, and zero review periods", async function () {
      const { escrow, client, provider, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const args = [provider.address, arbiter.address, SCOPE_HASH, ACCEPTANCE_HASH, now + DAY, HOUR];

      await expect(
        escrow.connect(client).createProject(...args)
      ).to.be.revertedWithCustomError(escrow, "InvalidAmount");

      await expect(
        escrow
          .connect(client)
          .createProject(
            provider.address,
            arbiter.address,
            ethers.ZeroHash,
            ACCEPTANCE_HASH,
            now + DAY,
            HOUR,
            { value: ESCROW }
          )
      ).to.be.revertedWithCustomError(escrow, "InvalidHash");

      await expect(
        escrow
          .connect(client)
          .createProject(
            provider.address,
            arbiter.address,
            SCOPE_HASH,
            ACCEPTANCE_HASH,
            now,
            HOUR,
            { value: ESCROW }
          )
      ).to.be.revertedWithCustomError(escrow, "InvalidDeadline");

      await expect(
        escrow
          .connect(client)
          .createProject(
            provider.address,
            arbiter.address,
            SCOPE_HASH,
            ACCEPTANCE_HASH,
            now + DAY,
            0,
            { value: ESCROW }
          )
      ).to.be.revertedWithCustomError(escrow, "InvalidReviewPeriod");

      await expect(
        escrow
          .connect(client)
          .createProject(
            provider.address,
            arbiter.address,
            SCOPE_HASH,
            ACCEPTANCE_HASH,
            now + DAY,
            90 * DAY + 1,
            { value: ESCROW }
          )
      ).to.be.revertedWithCustomError(escrow, "InvalidReviewPeriod");
    });

    it("rejects access to a nonexistent project", async function () {
      const { escrow } = await loadFixture(deployFixture);
      await expect(escrow.getProject(999)).to.be.revertedWithCustomError(
        escrow,
        "ProjectNotFound"
      );
    });
  });

  describe("delivery and client review", function () {
    it("allows only the named provider to submit non-empty hashes", async function () {
      const { escrow, client, provider, outsider, projectId } = await loadFixture(fundedFixture);

      await expect(
        escrow.connect(outsider).submitDelivery(projectId, DELIVERY_HASH, EVIDENCE_HASH)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      await expect(
        escrow.connect(provider).submitDelivery(projectId, ethers.ZeroHash, EVIDENCE_HASH)
      ).to.be.revertedWithCustomError(escrow, "InvalidHash");

      await expect(
        escrow.connect(provider).submitDelivery(projectId, DELIVERY_HASH, EVIDENCE_HASH)
      )
        .to.emit(escrow, "DeliverySubmitted")
        .withArgs(projectId, 1n, DELIVERY_HASH, EVIDENCE_HASH, anyValue);

      const project = await escrow.getProject(projectId);
      expect(project.state).to.equal(State.Submitted);
      expect(project.submissionCount).to.equal(1n);
      expect(project.deliveryHash).to.equal(DELIVERY_HASH);
      expect(project.deliveryEvidenceHash).to.equal(EVIDENCE_HASH);
      expect(project.reviewDeadline).to.be.greaterThan(0n);
      expect(project.client).to.equal(client.address);
    });

    it("accepts submission at the exact delivery deadline and rejects it after the deadline", async function () {
      const first = await loadFixture(fundedFixture);
      await time.setNextBlockTimestamp(first.deliveryDeadline);
      await expect(
        first.escrow
          .connect(first.provider)
          .submitDelivery(first.projectId, DELIVERY_HASH, EVIDENCE_HASH)
      ).not.to.be.reverted;

      const second = await loadFixture(fundedFixture);
      await time.increaseTo(second.deliveryDeadline + 1);
      await expect(
        second.escrow
          .connect(second.provider)
          .submitDelivery(second.projectId, DELIVERY_HASH, EVIDENCE_HASH)
      ).to.be.revertedWithCustomError(second.escrow, "DeadlinePassed");
    });

    it("allows only the client to approve before the review deadline", async function () {
      const { escrow, client, provider, outsider, projectId } = await loadFixture(submittedFixture);
      await expect(escrow.connect(outsider).approveDelivery(projectId)).to.be.revertedWithCustomError(
        escrow,
        "Unauthorized"
      );

      await expect(escrow.connect(client).approveDelivery(projectId))
        .to.emit(escrow, "DeliveryApproved")
        .withArgs(projectId, ESCROW);

      expect((await escrow.getProject(projectId)).state).to.equal(State.Resolved);
      expect(await escrow.pendingWithdrawalOf(provider.address)).to.equal(ESCROW);
      expect(await escrow.totalEscrowed()).to.equal(0n);
      expect(await escrow.totalPendingWithdrawals()).to.equal(ESCROW);
    });

    it("rejects client approval after the review deadline", async function () {
      const { escrow, client, projectId, reviewDeadline } = await loadFixture(submittedFixture);
      await time.increaseTo(reviewDeadline + 1);
      await expect(escrow.connect(client).approveDelivery(projectId)).to.be.revertedWithCustomError(
        escrow,
        "DeadlinePassed"
      );
    });

    it("permits one rejection and one resubmission", async function () {
      const { escrow, client, provider, projectId } = await loadFixture(submittedFixture);
      await expect(escrow.connect(client).rejectDelivery(projectId, REJECTION_HASH))
        .to.emit(escrow, "DeliveryRejected");

      let project = await escrow.getProject(projectId);
      expect(project.state).to.equal(State.Rejected);
      expect(project.rejectionReasonHash).to.equal(REJECTION_HASH);

      await escrow
        .connect(provider)
        .submitDelivery(projectId, DELIVERY_2_HASH, ethers.id("evidence-v2"));
      project = await escrow.getProject(projectId);
      expect(project.state).to.equal(State.Submitted);
      expect(project.submissionCount).to.equal(2n);

      await expect(
        escrow.connect(client).rejectDelivery(projectId, REJECTION_HASH)
      ).to.be.revertedWithCustomError(escrow, "ResubmissionLimitReached");
    });

    it("allows the client to dispute the second submission during review", async function () {
      const { escrow, client, provider, projectId } = await loadFixture(rejectedFixture);
      await escrow
        .connect(provider)
        .submitDelivery(projectId, DELIVERY_2_HASH, ethers.id("evidence-v2"));
      await expect(escrow.connect(client).openDispute(projectId, DISPUTE_HASH))
        .to.emit(escrow, "DisputeOpened")
        .withArgs(projectId, client.address, DISPUTE_HASH, State.Submitted);
      expect((await escrow.getProject(projectId)).state).to.equal(State.Disputed);
    });

    it("rejects a second submission while the first is still under review", async function () {
      const { escrow, provider, projectId } = await loadFixture(submittedFixture);
      await expect(
        escrow.connect(provider).submitDelivery(projectId, DELIVERY_2_HASH, EVIDENCE_HASH)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });
  });

  describe("mutually approved deadline extensions", function () {
    it("extends the delivery deadline only after counterparty approval", async function () {
      const { escrow, client, provider, projectId, deliveryDeadline } = await loadFixture(fundedFixture);
      const newDeadline = deliveryDeadline + DAY;

      await expect(escrow.connect(client).proposeExtension(projectId, newDeadline))
        .to.emit(escrow, "ExtensionProposed")
        .withArgs(projectId, client.address, deliveryDeadline, newDeadline, State.Funded);
      expect((await escrow.getProject(projectId)).deliveryDeadline).to.equal(deliveryDeadline);

      await expect(escrow.connect(provider).approveExtension(projectId))
        .to.emit(escrow, "ExtensionApproved")
        .withArgs(projectId, provider.address, deliveryDeadline, newDeadline, State.Funded);
      expect((await escrow.getProject(projectId)).deliveryDeadline).to.equal(newDeadline);
      expect((await escrow.pendingExtensionOf(projectId)).pending).to.equal(false);
    });

    it("extends the review deadline while a delivery is submitted", async function () {
      const { escrow, client, provider, projectId, reviewDeadline } = await loadFixture(submittedFixture);
      const newDeadline = reviewDeadline + DAY;
      await escrow.connect(provider).proposeExtension(projectId, newDeadline);
      await escrow.connect(client).approveExtension(projectId);
      expect((await escrow.getProject(projectId)).reviewDeadline).to.equal(newDeadline);
    });

    it("rejects unilateral, unauthorized, duplicate, and non-increasing extensions", async function () {
      const { escrow, client, provider, outsider, projectId, deliveryDeadline } =
        await loadFixture(fundedFixture);

      await expect(
        escrow.connect(outsider).proposeExtension(projectId, deliveryDeadline + DAY)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      await expect(
        escrow.connect(client).proposeExtension(projectId, deliveryDeadline)
      ).to.be.revertedWithCustomError(escrow, "InvalidDeadline");

      await escrow.connect(client).proposeExtension(projectId, deliveryDeadline + DAY);
      await expect(
        escrow.connect(provider).proposeExtension(projectId, deliveryDeadline + 2 * DAY)
      ).to.be.revertedWithCustomError(escrow, "ExtensionAlreadyPending");
      await expect(escrow.connect(client).approveExtension(projectId)).to.be.revertedWithCustomError(
        escrow,
        "ExtensionRequiresCounterparty"
      );
    });

    it("clears a pending extension when the project advances", async function () {
      const { escrow, client, provider, projectId, deliveryDeadline } = await loadFixture(fundedFixture);
      await escrow.connect(client).proposeExtension(projectId, deliveryDeadline + DAY);
      await escrow.connect(provider).submitDelivery(projectId, DELIVERY_HASH, EVIDENCE_HASH);
      expect((await escrow.pendingExtensionOf(projectId)).pending).to.equal(false);
    });

    it("rejects approval without a proposal and proposals outside an active deadline state", async function () {
      const { escrow, client, provider, projectId } = await loadFixture(submittedFixture);
      await expect(escrow.connect(provider).approveExtension(projectId)).to.be.revertedWithCustomError(
        escrow,
        "NoPendingExtension"
      );
      await escrow.connect(client).approveDelivery(projectId);
      await expect(
        escrow.connect(client).proposeExtension(projectId, (await time.latest()) + DAY)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });
  });

  describe("overdue states and disputes", function () {
    it("marks delivery overdue only after the deadline and only by the client", async function () {
      const { escrow, client, provider, outsider, projectId, deliveryDeadline } =
        await loadFixture(fundedFixture);

      await expect(
        escrow.connect(client).markDeliveryOverdue(projectId)
      ).to.be.revertedWithCustomError(escrow, "DeadlineNotReached");
      await time.increaseTo(deliveryDeadline + 1);
      await expect(
        escrow.connect(outsider).markDeliveryOverdue(projectId)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      await expect(escrow.connect(client).markDeliveryOverdue(projectId))
        .to.emit(escrow, "ProjectMarkedOverdue")
        .withArgs(projectId, State.DeliveryOverdue);
      expect((await escrow.getProject(projectId)).state).to.equal(State.DeliveryOverdue);
      expect(provider.address).not.to.equal(client.address);
    });

    it("marks review overdue only after the deadline and only by the provider", async function () {
      const { escrow, provider, client, projectId, reviewDeadline } = await loadFixture(submittedFixture);
      await expect(
        escrow.connect(provider).markReviewOverdue(projectId)
      ).to.be.revertedWithCustomError(escrow, "DeadlineNotReached");
      await time.increaseTo(reviewDeadline + 1);
      await expect(
        escrow.connect(client).markReviewOverdue(projectId)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      await expect(escrow.connect(provider).markReviewOverdue(projectId))
        .to.emit(escrow, "ProjectMarkedOverdue")
        .withArgs(projectId, State.ReviewOverdue);
    });

    it("opens a review-overdue dispute only for the provider", async function () {
      const { escrow, provider, client, projectId, reviewDeadline } =
        await loadFixture(submittedFixture);
      await time.increaseTo(reviewDeadline + 1);
      await escrow.connect(provider).markReviewOverdue(projectId);
      await expect(
        escrow.connect(client).openDispute(projectId, DISPUTE_HASH)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      await expect(escrow.connect(provider).openDispute(projectId, DISPUTE_HASH))
        .to.emit(escrow, "DisputeOpened")
        .withArgs(projectId, provider.address, DISPUTE_HASH, State.ReviewOverdue);
    });

    it("rejects delivery-overdue marking from an incompatible state", async function () {
      const { escrow, client, projectId, reviewDeadline } = await loadFixture(submittedFixture);
      await time.increaseTo(reviewDeadline + 1);
      await expect(
        escrow.connect(client).markDeliveryOverdue(projectId)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("allows only the affected party to open an overdue dispute", async function () {
      const { escrow, client, provider, projectId, deliveryDeadline } = await loadFixture(fundedFixture);
      await time.increaseTo(deliveryDeadline + 1);
      await escrow.connect(client).markDeliveryOverdue(projectId);
      await expect(
        escrow.connect(provider).openDispute(projectId, DISPUTE_HASH)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      await expect(escrow.connect(client).openDispute(projectId, DISPUTE_HASH))
        .to.emit(escrow, "DisputeOpened")
        .withArgs(projectId, client.address, DISPUTE_HASH, State.DeliveryOverdue);
    });

    it("allows the provider to dispute a rejection", async function () {
      const { escrow, provider, client, projectId } = await loadFixture(rejectedFixture);
      await expect(
        escrow.connect(client).openDispute(projectId, DISPUTE_HASH)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      await expect(escrow.connect(provider).openDispute(projectId, DISPUTE_HASH))
        .to.emit(escrow, "DisputeOpened")
        .withArgs(projectId, provider.address, DISPUTE_HASH, State.Rejected);
    });

    it("rejects empty dispute evidence and disputes from invalid states", async function () {
      const { escrow, client, projectId } = await loadFixture(fundedFixture);
      await expect(
        escrow.connect(client).openDispute(projectId, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(escrow, "InvalidHash");
      await expect(
        escrow.connect(client).openDispute(projectId, DISPUTE_HASH)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });
  });

  describe("arbitration and settlement accounting", function () {
    it("allows only the arbiter to resolve a dispute", async function () {
      const { escrow, client, arbiter, projectId } = await loadFixture(deliveryDisputeFixture);
      await expect(
        escrow.connect(client).resolveDispute(projectId, 5000)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      await expect(escrow.connect(arbiter).resolveDispute(projectId, 5000))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(projectId, 5000, ESCROW / 2n, ESCROW / 2n);
    });

    it("rejects allocations above 100%", async function () {
      const { escrow, arbiter, projectId } = await loadFixture(deliveryDisputeFixture);
      await expect(
        escrow.connect(arbiter).resolveDispute(projectId, 10001)
      ).to.be.revertedWithCustomError(escrow, "InvalidProviderShare");
    });

    it("supports 0%, 20%, 50%, 80%, and 100% provider allocations", async function () {
      const { escrow, client, provider, arbiter } = await loadFixture(deployFixture);
      const shares = [0, 2000, 5000, 8000, 10000];

      for (let i = 0; i < shares.length; i += 1) {
        const deadline = (await time.latest()) + HOUR;
        await escrow
          .connect(client)
          .createProject(
            provider.address,
            arbiter.address,
            ethers.id(`scope-${i}`),
            ethers.id(`criteria-${i}`),
            deadline,
            HOUR,
            { value: ESCROW }
          );
        const id = BigInt(i + 1);
        await time.increaseTo(deadline + 1);
        await escrow.connect(client).markDeliveryOverdue(id);
        await escrow.connect(client).openDispute(id, ethers.id(`dispute-${i}`));

        const providerBefore = await escrow.pendingWithdrawalOf(provider.address);
        const clientBefore = await escrow.pendingWithdrawalOf(client.address);
        await escrow.connect(arbiter).resolveDispute(id, shares[i]);
        const expectedProvider = (ESCROW * BigInt(shares[i])) / 10000n;
        expect((await escrow.pendingWithdrawalOf(provider.address)) - providerBefore).to.equal(
          expectedProvider
        );
        expect((await escrow.pendingWithdrawalOf(client.address)) - clientBefore).to.equal(
          ESCROW - expectedProvider
        );
      }
    });

    it("assigns the exact rounding remainder to the client", async function () {
      const { escrow, client, provider, arbiter } = await loadFixture(deployFixture);
      const amount = 101n;
      const deadline = (await time.latest()) + HOUR;
      await escrow
        .connect(client)
        .createProject(
          provider.address,
          arbiter.address,
          SCOPE_HASH,
          ACCEPTANCE_HASH,
          deadline,
          HOUR,
          { value: amount }
        );
      await time.increaseTo(deadline + 1);
      await escrow.connect(client).markDeliveryOverdue(1);
      await escrow.connect(client).openDispute(1, DISPUTE_HASH);
      await escrow.connect(arbiter).resolveDispute(1, 3333);

      const providerAmount = await escrow.pendingWithdrawalOf(provider.address);
      const clientAmount = await escrow.pendingWithdrawalOf(client.address);
      expect(providerAmount).to.equal(33n);
      expect(clientAmount).to.equal(68n);
      expect(providerAmount + clientAmount).to.equal(amount);
    });

    it("prevents repeated settlement", async function () {
      const { escrow, arbiter, projectId } = await loadFixture(deliveryDisputeFixture);
      await escrow.connect(arbiter).resolveDispute(projectId, 5000);
      await expect(
        escrow.connect(arbiter).resolveDispute(projectId, 5000)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("preserves the accounting invariant before and after resolution", async function () {
      const { escrow, arbiter, projectId } = await loadFixture(deliveryDisputeFixture);
      expect(await escrow.accountedBalance()).to.equal(await ethers.provider.getBalance(escrow.target));
      await escrow.connect(arbiter).resolveDispute(projectId, 8000);
      expect(await escrow.totalEscrowed()).to.equal(0n);
      expect(await escrow.totalPendingWithdrawals()).to.equal(ESCROW);
      expect(await escrow.accountedBalance()).to.equal(await ethers.provider.getBalance(escrow.target));
    });
  });

  describe("pull-payment withdrawals", function () {
    it("withdraws credited funds once and emits the transfer record", async function () {
      const { escrow, client, provider, projectId } = await loadFixture(submittedFixture);
      await escrow.connect(client).approveDelivery(projectId);

      const withdrawal = escrow.connect(provider).withdraw();
      await expect(withdrawal)
        .to.emit(escrow, "WithdrawalCompleted")
        .withArgs(provider.address, ESCROW);
      expect(await escrow.pendingWithdrawalOf(provider.address)).to.equal(0n);
      expect(await escrow.totalPendingWithdrawals()).to.equal(0n);
      expect(await ethers.provider.getBalance(escrow.target)).to.equal(0n);
      await expect(escrow.connect(provider).withdraw()).to.be.revertedWithCustomError(
        escrow,
        "NoPendingWithdrawal"
      );
    });

    it("isolates a receiver that rejects Ether from the other settlement party", async function () {
      const { escrow, client, arbiter } = await loadFixture(deployFixture);
      const Receiver = await ethers.getContractFactory("MaliciousWithdrawalReceiver");
      const receiver = await Receiver.deploy(escrow.target);
      await receiver.waitForDeployment();
      const deadline = (await time.latest()) + HOUR;

      await escrow
        .connect(client)
        .createProject(
          receiver.target,
          arbiter.address,
          SCOPE_HASH,
          ACCEPTANCE_HASH,
          deadline,
          HOUR,
          { value: ESCROW }
        );
      await time.increaseTo(deadline + 1);
      await escrow.connect(client).markDeliveryOverdue(1);
      await escrow.connect(client).openDispute(1, DISPUTE_HASH);
      await escrow.connect(arbiter).resolveDispute(1, 5000);

      await receiver.configure(true, false);
      await expect(receiver.triggerWithdrawal()).to.be.revertedWithCustomError(
        escrow,
        "EtherTransferFailed"
      );
      expect(await escrow.pendingWithdrawalOf(receiver.target)).to.equal(ESCROW / 2n);

      await expect(escrow.connect(client).withdraw()).to.changeEtherBalances(
        [escrow, client],
        [-ESCROW / 2n, ESCROW / 2n]
      );
      expect(await escrow.pendingWithdrawalOf(receiver.target)).to.equal(ESCROW / 2n);
    });

    it("blocks a reentrant second withdrawal", async function () {
      const { escrow, client, arbiter } = await loadFixture(deployFixture);
      const Receiver = await ethers.getContractFactory("MaliciousWithdrawalReceiver");
      const receiver = await Receiver.deploy(escrow.target);
      await receiver.waitForDeployment();
      const deadline = (await time.latest()) + HOUR;

      await escrow
        .connect(client)
        .createProject(
          receiver.target,
          arbiter.address,
          SCOPE_HASH,
          ACCEPTANCE_HASH,
          deadline,
          HOUR,
          { value: ESCROW }
        );
      await time.increaseTo(deadline + 1);
      await escrow.connect(client).markDeliveryOverdue(1);
      await escrow.connect(client).openDispute(1, DISPUTE_HASH);
      await escrow.connect(arbiter).resolveDispute(1, 10000);

      await receiver.configure(false, true);
      await expect(receiver.triggerWithdrawal()).to.changeEtherBalances(
        [escrow, receiver],
        [-ESCROW, ESCROW]
      );
      expect(await escrow.pendingWithdrawalOf(receiver.target)).to.equal(0n);
      expect(await ethers.provider.getBalance(receiver.target)).to.equal(ESCROW);
    });
  });
});
