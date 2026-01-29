// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IdentityRegistry.sol";

/**
 * @title ReputationRegistry
 * @notice ERC-8004 Reputation Registry - Feedback and reputation tracking for agents
 * @dev Implements the Reputation Registry component of ERC-8004 Trustless Agents standard
 */
contract ReputationRegistry is Ownable {
    // Reference to the Identity Registry
    IdentityRegistry public identityRegistry;

    // Feedback struct stored on-chain
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
    }

    // Mapping: agentId => clientAddress => feedbackIndex => Feedback
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) private _feedback;

    // Mapping: agentId => clientAddress => feedbackCount
    mapping(uint256 => mapping(address => uint64)) private _feedbackCounts;

    // Mapping: agentId => list of client addresses who gave feedback
    mapping(uint256 => address[]) private _agentClients;
    mapping(uint256 => mapping(address => bool)) private _isClient;

    // Events
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex
    );

    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseURI,
        bytes32 responseHash
    );

    constructor(address _identityRegistry) Ownable(msg.sender) {
        identityRegistry = IdentityRegistry(_identityRegistry);
    }

    /**
     * @notice Get the Identity Registry address
     * @return The Identity Registry contract address
     */
    function getIdentityRegistry() external view returns (address) {
        return address(identityRegistry);
    }

    /**
     * @notice Submit feedback for an agent
     * @param agentId The agent ID receiving feedback
     * @param value The feedback value (signed fixed-point)
     * @param valueDecimals The decimal places for the value (0-18)
     * @param tag1 Optional tag for categorization
     * @param tag2 Optional second tag
     * @param endpoint Optional endpoint the feedback is about
     * @param feedbackURI Optional URI to off-chain feedback details
     * @param feedbackHash Optional keccak256 hash of feedbackURI content
     */
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        require(valueDecimals <= 18, "Decimals must be <= 18");
        require(_exists(agentId), "Agent does not exist");
        
        // Feedback submitter must not be the agent owner or approved operator
        address agentOwner = identityRegistry.ownerOf(agentId);
        require(msg.sender != agentOwner, "Owner cannot give self feedback");
        require(!identityRegistry.isApprovedForAll(agentOwner, msg.sender), "Operator cannot give feedback");
        require(identityRegistry.getApproved(agentId) != msg.sender, "Approved cannot give feedback");

        // Track new clients
        if (!_isClient[agentId][msg.sender]) {
            _agentClients[agentId].push(msg.sender);
            _isClient[agentId][msg.sender] = true;
        }

        // Increment feedback index (1-indexed)
        uint64 feedbackIndex = ++_feedbackCounts[agentId][msg.sender];

        // Store feedback
        _feedback[agentId][msg.sender][feedbackIndex] = Feedback({
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            isRevoked: false
        });

        emit NewFeedback(
            agentId,
            msg.sender,
            feedbackIndex,
            value,
            valueDecimals,
            tag1,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }

    /**
     * @notice Revoke previously submitted feedback
     * @param agentId The agent ID
     * @param feedbackIndex The feedback index to revoke
     */
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbackIndex > 0 && feedbackIndex <= _feedbackCounts[agentId][msg.sender], "Invalid feedback index");
        require(!_feedback[agentId][msg.sender][feedbackIndex].isRevoked, "Already revoked");

        _feedback[agentId][msg.sender][feedbackIndex].isRevoked = true;

        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    /**
     * @notice Append a response to feedback (can be from agent or any third party)
     * @param agentId The agent ID
     * @param clientAddress The original feedback submitter
     * @param feedbackIndex The feedback index
     * @param responseURI URI to the response content
     * @param responseHash keccak256 hash of the response content
     */
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external {
        require(feedbackIndex > 0 && feedbackIndex <= _feedbackCounts[agentId][clientAddress], "Invalid feedback index");

        emit ResponseAppended(
            agentId,
            clientAddress,
            feedbackIndex,
            msg.sender,
            responseURI,
            responseHash
        );
    }

    /**
     * @notice Read a single feedback entry
     * @param agentId The agent ID
     * @param clientAddress The feedback submitter
     * @param feedbackIndex The feedback index
     * @return value The feedback value
     * @return valueDecimals The decimal places
     * @return tag1 First tag
     * @return tag2 Second tag
     * @return isRevoked Whether the feedback was revoked
     */
    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (
        int128 value,
        uint8 valueDecimals,
        string memory tag1,
        string memory tag2,
        bool isRevoked
    ) {
        Feedback storage fb = _feedback[agentId][clientAddress][feedbackIndex];
        return (fb.value, fb.valueDecimals, fb.tag1, fb.tag2, fb.isRevoked);
    }

    /**
     * @notice Get summary statistics for an agent's feedback
     * @param agentId The agent ID
     * @param clientAddresses Array of client addresses to include (required)
     * @param tag1 Optional tag filter
     * @param tag2 Optional tag filter
     * @return count Number of matching feedback entries
     * @return summaryValue Sum of feedback values
     * @return summaryValueDecimals The decimal places used for summaryValue
     */
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (
        uint64 count,
        int128 summaryValue,
        uint8 summaryValueDecimals
    ) {
        require(clientAddresses.length > 0, "Client addresses required");

        int256 sum = 0;
        uint8 maxDecimals = 0;

        for (uint256 i = 0; i < clientAddresses.length; i++) {
            address client = clientAddresses[i];
            uint64 feedbackCount = _feedbackCounts[agentId][client];

            for (uint64 j = 1; j <= feedbackCount; j++) {
                Feedback storage fb = _feedback[agentId][client][j];
                
                // Skip revoked feedback
                if (fb.isRevoked) continue;

                // Apply tag filters if provided
                if (bytes(tag1).length > 0 && keccak256(bytes(fb.tag1)) != keccak256(bytes(tag1))) continue;
                if (bytes(tag2).length > 0 && keccak256(bytes(fb.tag2)) != keccak256(bytes(tag2))) continue;

                count++;
                
                // Track max decimals for normalization
                if (fb.valueDecimals > maxDecimals) {
                    maxDecimals = fb.valueDecimals;
                }

                // Normalize and sum values
                int256 normalizedValue = int256(fb.value) * int256(10 ** (maxDecimals - fb.valueDecimals));
                sum += normalizedValue;
            }
        }

        summaryValue = int128(sum);
        summaryValueDecimals = maxDecimals;
    }

    /**
     * @notice Read all feedback for an agent with optional filters
     * @param agentId The agent ID
     * @param clientAddresses Optional filter by specific clients (empty = all clients)
     * @param tag1 Optional tag filter
     * @param tag2 Optional tag filter
     * @param includeRevoked Whether to include revoked feedback
     */
    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    ) external view returns (
        address[] memory clients,
        uint64[] memory feedbackIndexes,
        int128[] memory values,
        uint8[] memory valueDecimals,
        string[] memory tag1s,
        string[] memory tag2s,
        bool[] memory revokedStatuses
    ) {
        // First, count total feedback entries
        uint256 totalCount = 0;
        address[] memory searchClients = clientAddresses.length > 0 ? clientAddresses : _agentClients[agentId];

        for (uint256 i = 0; i < searchClients.length; i++) {
            address client = searchClients[i];
            uint64 feedbackCount = _feedbackCounts[agentId][client];

            for (uint64 j = 1; j <= feedbackCount; j++) {
                Feedback storage fb = _feedback[agentId][client][j];
                
                if (!includeRevoked && fb.isRevoked) continue;
                if (bytes(tag1).length > 0 && keccak256(bytes(fb.tag1)) != keccak256(bytes(tag1))) continue;
                if (bytes(tag2).length > 0 && keccak256(bytes(fb.tag2)) != keccak256(bytes(tag2))) continue;

                totalCount++;
            }
        }

        // Initialize arrays
        clients = new address[](totalCount);
        feedbackIndexes = new uint64[](totalCount);
        values = new int128[](totalCount);
        valueDecimals = new uint8[](totalCount);
        tag1s = new string[](totalCount);
        tag2s = new string[](totalCount);
        revokedStatuses = new bool[](totalCount);

        // Populate arrays
        uint256 idx = 0;
        for (uint256 i = 0; i < searchClients.length; i++) {
            address client = searchClients[i];
            uint64 feedbackCount = _feedbackCounts[agentId][client];

            for (uint64 j = 1; j <= feedbackCount; j++) {
                Feedback storage fb = _feedback[agentId][client][j];
                
                if (!includeRevoked && fb.isRevoked) continue;
                if (bytes(tag1).length > 0 && keccak256(bytes(fb.tag1)) != keccak256(bytes(tag1))) continue;
                if (bytes(tag2).length > 0 && keccak256(bytes(fb.tag2)) != keccak256(bytes(tag2))) continue;

                clients[idx] = client;
                feedbackIndexes[idx] = j;
                values[idx] = fb.value;
                valueDecimals[idx] = fb.valueDecimals;
                tag1s[idx] = fb.tag1;
                tag2s[idx] = fb.tag2;
                revokedStatuses[idx] = fb.isRevoked;
                idx++;
            }
        }
    }

    /**
     * @notice Get all clients who have given feedback to an agent
     * @param agentId The agent ID
     * @return Array of client addresses
     */
    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _agentClients[agentId];
    }

    /**
     * @notice Get the last feedback index for a client-agent pair
     * @param agentId The agent ID
     * @param clientAddress The client address
     * @return The last feedback index (0 if no feedback)
     */
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return _feedbackCounts[agentId][clientAddress];
    }

    /**
     * @notice Get the count of responses for a feedback entry
     * @param agentId The agent ID
     * @param clientAddress The feedback submitter
     * @param feedbackIndex The feedback index
     * @param responders Optional filter by specific responders
     * @return count The number of responses (tracked via events, returns 0 here)
     */
    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) external pure returns (uint64 count) {
        // Response count is tracked via events, not stored on-chain
        // This function exists for interface compliance
        // Off-chain indexers should track ResponseAppended events
        return 0;
    }

    /**
     * @notice Check if an agent exists in the Identity Registry
     * @param agentId The agent ID
     * @return True if the agent exists
     */
    function _exists(uint256 agentId) internal view returns (bool) {
        try identityRegistry.ownerOf(agentId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @notice Update the Identity Registry reference (owner only)
     * @param _identityRegistry New Identity Registry address
     */
    function setIdentityRegistry(address _identityRegistry) external onlyOwner {
        identityRegistry = IdentityRegistry(_identityRegistry);
    }
}
