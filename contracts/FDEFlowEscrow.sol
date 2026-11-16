// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title FDEFlow Escrow
/// @notice Holds test ETH for a single-milestone AI workflow engagement and records
///         tamper-evident delivery and dispute evidence hashes.
/// @dev Delivery quality is deliberately decided off-chain. The contract enforces
///      roles, deadlines, state transitions, allocation, and pull-payment withdrawals.
contract FDEFlowEscrow is ReentrancyGuard {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant MAX_SUBMISSIONS = 2;
    uint64 public constant MAX_REVIEW_PERIOD = 90 days;

    enum ProjectState {
        None,
        Funded,
        Submitted,
        Rejected,
        DeliveryOverdue,
        ReviewOverdue,
        Disputed,
        Resolved
    }

    struct Project {
        address client;
        address provider;
        address arbiter;
        uint256 amount;
        bytes32 scopeHash;
        bytes32 acceptanceCriteriaHash;
        bytes32 deliveryHash;
        bytes32 deliveryEvidenceHash;
        bytes32 rejectionReasonHash;
        bytes32 disputeEvidenceHash;
        uint64 deliveryDeadline;
        uint64 reviewDeadline;
        uint64 reviewPeriod;
        uint8 submissionCount;
        uint16 providerShareBps;
        ProjectState state;
    }

    struct ExtensionProposal {
        address proposer;
        uint64 newDeadline;
        ProjectState stateAtProposal;
        bool pending;
    }

    uint256 private _nextProjectId = 1;
    mapping(uint256 projectId => Project project) private _projects;
    mapping(uint256 projectId => ExtensionProposal proposal) private _extensions;
    mapping(address account => uint256 amount) private _pendingWithdrawals;

    uint256 public totalEscrowed;
    uint256 public totalPendingWithdrawals;

    error ProjectNotFound(uint256 projectId);
    error Unauthorized(address caller);
    error InvalidState(ProjectState expected, ProjectState actual);
    error InvalidAddress();
    error DuplicateRole();
    error InvalidHash();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidReviewPeriod();
    error DeadlinePassed(uint64 deadline, uint256 currentTime);
    error DeadlineNotReached(uint64 deadline, uint256 currentTime);
    error ResubmissionLimitReached();
    error ExtensionAlreadyPending();
    error NoPendingExtension();
    error ExtensionRequiresCounterparty();
    error ExtensionContextChanged();
    error InvalidProviderShare(uint16 providerShareBps);
    error NoPendingWithdrawal();
    error EtherTransferFailed();

    event ProjectCreated(
        uint256 indexed projectId,
        address indexed client,
        address indexed provider,
        address arbiter,
        uint256 amount,
        uint64 deliveryDeadline,
        uint64 reviewPeriod,
        bytes32 scopeHash,
        bytes32 acceptanceCriteriaHash
    );
    event DeliverySubmitted(
        uint256 indexed projectId,
        uint8 indexed submissionNumber,
        bytes32 deliveryHash,
        bytes32 evidenceHash,
        uint64 reviewDeadline
    );
    event DeliveryRejected(
        uint256 indexed projectId,
        bytes32 reasonHash,
        uint64 resubmissionDeadline
    );
    event ExtensionProposed(
        uint256 indexed projectId,
        address indexed proposer,
        uint64 currentDeadline,
        uint64 proposedDeadline,
        ProjectState state
    );
    event ExtensionApproved(
        uint256 indexed projectId,
        address indexed approver,
        uint64 previousDeadline,
        uint64 newDeadline,
        ProjectState state
    );
    event ProjectMarkedOverdue(uint256 indexed projectId, ProjectState overdueState);
    event DisputeOpened(
        uint256 indexed projectId,
        address indexed openedBy,
        bytes32 evidenceHash,
        ProjectState previousState
    );
    event DisputeResolved(
        uint256 indexed projectId,
        uint16 providerShareBps,
        uint256 providerAmount,
        uint256 clientAmount
    );
    event DeliveryApproved(uint256 indexed projectId, uint256 providerAmount);
    event WithdrawalCompleted(address indexed account, uint256 amount);

    /// @notice Creates a funded project. The caller becomes the client.
    function createProject(
        address provider,
        address arbiter,
        bytes32 scopeHash,
        bytes32 acceptanceCriteriaHash,
        uint64 deliveryDeadline,
        uint64 reviewPeriod
    ) external payable returns (uint256 projectId) {
        if (provider == address(0) || arbiter == address(0)) revert InvalidAddress();
        if (provider == msg.sender || arbiter == msg.sender || provider == arbiter) revert DuplicateRole();
        if (scopeHash == bytes32(0) || acceptanceCriteriaHash == bytes32(0)) revert InvalidHash();
        if (msg.value == 0) revert InvalidAmount();
        if (deliveryDeadline <= block.timestamp) revert InvalidDeadline();
        if (reviewPeriod == 0 || reviewPeriod > MAX_REVIEW_PERIOD) revert InvalidReviewPeriod();

        projectId = _nextProjectId++;
        _projects[projectId] = Project({
            client: msg.sender,
            provider: provider,
            arbiter: arbiter,
            amount: msg.value,
            scopeHash: scopeHash,
            acceptanceCriteriaHash: acceptanceCriteriaHash,
            deliveryHash: bytes32(0),
            deliveryEvidenceHash: bytes32(0),
            rejectionReasonHash: bytes32(0),
            disputeEvidenceHash: bytes32(0),
            deliveryDeadline: deliveryDeadline,
            reviewDeadline: 0,
            reviewPeriod: reviewPeriod,
            submissionCount: 0,
            providerShareBps: 0,
            state: ProjectState.Funded
        });
        totalEscrowed += msg.value;

        emit ProjectCreated(
            projectId,
            msg.sender,
            provider,
            arbiter,
            msg.value,
            deliveryDeadline,
            reviewPeriod,
            scopeHash,
            acceptanceCriteriaHash
        );
    }

    /// @notice Records a delivery or the single permitted resubmission.
    function submitDelivery(uint256 projectId, bytes32 deliveryHash, bytes32 evidenceHash) external {
        Project storage project = _project(projectId);
        _onlyProvider(project);
        if (project.state != ProjectState.Funded && project.state != ProjectState.Rejected) {
            revert InvalidState(ProjectState.Funded, project.state);
        }
        if (block.timestamp > project.deliveryDeadline) {
            revert DeadlinePassed(project.deliveryDeadline, block.timestamp);
        }
        if (deliveryHash == bytes32(0) || evidenceHash == bytes32(0)) revert InvalidHash();
        if (project.submissionCount >= MAX_SUBMISSIONS) revert ResubmissionLimitReached();

        project.submissionCount += 1;
        project.deliveryHash = deliveryHash;
        project.deliveryEvidenceHash = evidenceHash;
        project.rejectionReasonHash = bytes32(0);
        project.reviewDeadline = uint64(block.timestamp) + project.reviewPeriod;
        project.state = ProjectState.Submitted;
        _clearExtension(projectId);

        emit DeliverySubmitted(
            projectId,
            project.submissionCount,
            deliveryHash,
            evidenceHash,
            project.reviewDeadline
        );
    }

    /// @notice Accepts a submitted delivery and credits the provider with the full escrow.
    function approveDelivery(uint256 projectId) external {
        Project storage project = _project(projectId);
        _onlyClient(project);
        _requireState(project, ProjectState.Submitted);
        _requireNotPast(project.reviewDeadline);

        uint256 amount = project.amount;
        project.providerShareBps = BPS_DENOMINATOR;
        project.state = ProjectState.Resolved;
        _creditSettlement(project.provider, amount, projectId);

        emit DeliveryApproved(projectId, amount);
    }

    /// @notice Rejects the first delivery and creates a resubmission window equal to the review period.
    function rejectDelivery(uint256 projectId, bytes32 reasonHash) external {
        Project storage project = _project(projectId);
        _onlyClient(project);
        _requireState(project, ProjectState.Submitted);
        _requireNotPast(project.reviewDeadline);
        if (reasonHash == bytes32(0)) revert InvalidHash();
        if (project.submissionCount >= MAX_SUBMISSIONS) revert ResubmissionLimitReached();

        project.rejectionReasonHash = reasonHash;
        project.deliveryDeadline = uint64(block.timestamp) + project.reviewPeriod;
        project.reviewDeadline = 0;
        project.state = ProjectState.Rejected;
        _clearExtension(projectId);

        emit DeliveryRejected(projectId, reasonHash, project.deliveryDeadline);
    }

    /// @notice Proposes a later active deadline. The counterparty must approve it.
    function proposeExtension(uint256 projectId, uint64 newDeadline) external {
        Project storage project = _project(projectId);
        _onlyCommercialParty(project);
        uint64 currentDeadline = _activeDeadline(project);
        if (_extensions[projectId].pending) revert ExtensionAlreadyPending();
        if (block.timestamp > currentDeadline || newDeadline <= currentDeadline || newDeadline <= block.timestamp) {
            revert InvalidDeadline();
        }

        _extensions[projectId] = ExtensionProposal({
            proposer: msg.sender,
            newDeadline: newDeadline,
            stateAtProposal: project.state,
            pending: true
        });

        emit ExtensionProposed(projectId, msg.sender, currentDeadline, newDeadline, project.state);
    }

    /// @notice Approves a pending extension proposed by the other commercial party.
    function approveExtension(uint256 projectId) external {
        Project storage project = _project(projectId);
        _onlyCommercialParty(project);
        ExtensionProposal memory proposal = _extensions[projectId];
        if (!proposal.pending) revert NoPendingExtension();
        if (proposal.proposer == msg.sender) revert ExtensionRequiresCounterparty();
        if (proposal.stateAtProposal != project.state) revert ExtensionContextChanged();
        if (proposal.newDeadline <= block.timestamp) revert InvalidDeadline();

        uint64 previousDeadline = _activeDeadline(project);
        if (project.state == ProjectState.Submitted) {
            project.reviewDeadline = proposal.newDeadline;
        } else {
            project.deliveryDeadline = proposal.newDeadline;
        }
        delete _extensions[projectId];

        emit ExtensionApproved(
            projectId,
            msg.sender,
            previousDeadline,
            proposal.newDeadline,
            project.state
        );
    }

    /// @notice Records that the provider missed the delivery or resubmission deadline.
    function markDeliveryOverdue(uint256 projectId) external {
        Project storage project = _project(projectId);
        _onlyClient(project);
        if (project.state != ProjectState.Funded && project.state != ProjectState.Rejected) {
            revert InvalidState(ProjectState.Funded, project.state);
        }
        _requirePast(project.deliveryDeadline);

        project.state = ProjectState.DeliveryOverdue;
        _clearExtension(projectId);
        emit ProjectMarkedOverdue(projectId, ProjectState.DeliveryOverdue);
    }

    /// @notice Records that the client missed the review deadline.
    function markReviewOverdue(uint256 projectId) external {
        Project storage project = _project(projectId);
        _onlyProvider(project);
        _requireState(project, ProjectState.Submitted);
        _requirePast(project.reviewDeadline);

        project.state = ProjectState.ReviewOverdue;
        _clearExtension(projectId);
        emit ProjectMarkedOverdue(projectId, ProjectState.ReviewOverdue);
    }

    /// @notice Opens arbitration after an overdue marker, or after a disputed rejection.
    function openDispute(uint256 projectId, bytes32 evidenceHash) external {
        Project storage project = _project(projectId);
        if (evidenceHash == bytes32(0)) revert InvalidHash();

        ProjectState previousState = project.state;
        if (previousState == ProjectState.DeliveryOverdue) {
            _onlyClient(project);
        } else if (previousState == ProjectState.ReviewOverdue || previousState == ProjectState.Rejected) {
            _onlyProvider(project);
        } else if (previousState == ProjectState.Submitted && project.submissionCount == MAX_SUBMISSIONS) {
            _onlyClient(project);
            _requireNotPast(project.reviewDeadline);
        } else {
            revert InvalidState(ProjectState.DeliveryOverdue, previousState);
        }

        project.disputeEvidenceHash = evidenceHash;
        project.state = ProjectState.Disputed;
        _clearExtension(projectId);
        emit DisputeOpened(projectId, msg.sender, evidenceHash, previousState);
    }

    /// @notice Resolves a dispute using any provider allocation from 0 to 10,000 basis points.
    function resolveDispute(uint256 projectId, uint16 providerShareBps) external {
        Project storage project = _project(projectId);
        _onlyArbiter(project);
        _requireState(project, ProjectState.Disputed);
        if (providerShareBps > BPS_DENOMINATOR) revert InvalidProviderShare(providerShareBps);

        uint256 providerAmount = Math.mulDiv(project.amount, providerShareBps, BPS_DENOMINATOR);
        uint256 clientAmount = project.amount - providerAmount;
        project.providerShareBps = providerShareBps;
        project.state = ProjectState.Resolved;

        totalEscrowed -= project.amount;
        if (providerAmount != 0) {
            _pendingWithdrawals[project.provider] += providerAmount;
            totalPendingWithdrawals += providerAmount;
        }
        if (clientAmount != 0) {
            _pendingWithdrawals[project.client] += clientAmount;
            totalPendingWithdrawals += clientAmount;
        }

        emit DisputeResolved(projectId, providerShareBps, providerAmount, clientAmount);
    }

    /// @notice Withdraws all funds credited to the caller.
    function withdraw() external nonReentrant {
        uint256 amount = _pendingWithdrawals[msg.sender];
        if (amount == 0) revert NoPendingWithdrawal();

        _pendingWithdrawals[msg.sender] = 0;
        totalPendingWithdrawals -= amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert EtherTransferFailed();

        emit WithdrawalCompleted(msg.sender, amount);
    }

    function getProject(uint256 projectId) external view returns (Project memory) {
        Project storage project = _project(projectId);
        return project;
    }

    function pendingExtensionOf(uint256 projectId) external view returns (ExtensionProposal memory) {
        _project(projectId);
        return _extensions[projectId];
    }

    function pendingWithdrawalOf(address account) external view returns (uint256) {
        return _pendingWithdrawals[account];
    }

    function nextProjectId() external view returns (uint256) {
        return _nextProjectId;
    }

    function accountedBalance() external view returns (uint256) {
        return totalEscrowed + totalPendingWithdrawals;
    }

    function _project(uint256 projectId) private view returns (Project storage project) {
        project = _projects[projectId];
        if (project.state == ProjectState.None) revert ProjectNotFound(projectId);
    }

    function _requireState(Project storage project, ProjectState expected) private view {
        if (project.state != expected) revert InvalidState(expected, project.state);
    }

    function _onlyClient(Project storage project) private view {
        if (msg.sender != project.client) revert Unauthorized(msg.sender);
    }

    function _onlyProvider(Project storage project) private view {
        if (msg.sender != project.provider) revert Unauthorized(msg.sender);
    }

    function _onlyArbiter(Project storage project) private view {
        if (msg.sender != project.arbiter) revert Unauthorized(msg.sender);
    }

    function _onlyCommercialParty(Project storage project) private view {
        if (msg.sender != project.client && msg.sender != project.provider) revert Unauthorized(msg.sender);
    }

    function _activeDeadline(Project storage project) private view returns (uint64) {
        if (project.state == ProjectState.Funded || project.state == ProjectState.Rejected) {
            return project.deliveryDeadline;
        }
        if (project.state == ProjectState.Submitted) return project.reviewDeadline;
        revert InvalidState(ProjectState.Funded, project.state);
    }

    function _requireNotPast(uint64 deadline) private view {
        if (block.timestamp > deadline) revert DeadlinePassed(deadline, block.timestamp);
    }

    function _requirePast(uint64 deadline) private view {
        if (block.timestamp <= deadline) revert DeadlineNotReached(deadline, block.timestamp);
    }

    function _clearExtension(uint256 projectId) private {
        if (_extensions[projectId].pending) delete _extensions[projectId];
    }

    function _creditSettlement(address recipient, uint256 amount, uint256 projectId) private {
        totalEscrowed -= amount;
        _pendingWithdrawals[recipient] += amount;
        totalPendingWithdrawals += amount;
        _clearExtension(projectId);
    }
}
