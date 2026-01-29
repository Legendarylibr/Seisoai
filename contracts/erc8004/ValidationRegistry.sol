// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IdentityRegistry.sol";

/**
 * @title ValidationRegistry
 * @notice ERC-8004 Validation Registry - Request and record validation of agent work
 * @dev Implements the Validation Registry component of ERC-8004 Trustless Agents standard
 */
contract ValidationRegistry is Ownable {
    // Reference to the Identity Registry
    IdentityRegistry public identityRegistry;

    // Validation status struct
    struct ValidationStatus {
        address validatorAddress;
        uint256 agentId;
        uint8 response;          // 0-100 (0 = failed, 100 = passed)
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bool exists;
    }

    // Mapping: requestHash => ValidationStatus
    mapping(bytes32 => ValidationStatus) private _validations;

    // Mapping: agentId => list of request hashes
    mapping(uint256 => bytes32[]) private _agentValidations;

    // Mapping: validatorAddress => list of request hashes
    mapping(address => bytes32[]) private _validatorRequests;

    // Events
    event ValidationRequest(
        address indexed validatorAddress,
        uint256 indexed agentId,
        string requestURI,
        bytes32 indexed requestHash
    );

    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
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
     * @notice Request validation for agent work
     * @param validatorAddress The validator contract/address to handle this request
     * @param agentId The agent ID requesting validation
     * @param requestURI URI pointing to off-chain data needed for validation
     * @param requestHash keccak256 hash of the request payload
     */
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        require(_isApprovedOrOwner(msg.sender, agentId), "Not owner or approved");
        require(validatorAddress != address(0), "Invalid validator address");
        require(requestHash != bytes32(0), "Invalid request hash");

        // Store the validation request
        if (!_validations[requestHash].exists) {
            _agentValidations[agentId].push(requestHash);
            _validatorRequests[validatorAddress].push(requestHash);
        }

        _validations[requestHash] = ValidationStatus({
            validatorAddress: validatorAddress,
            agentId: agentId,
            response: 0,
            responseHash: bytes32(0),
            tag: "",
            lastUpdate: block.timestamp,
            exists: true
        });

        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    /**
     * @notice Submit validation response
     * @param requestHash The original request hash
     * @param response Validation result (0-100, binary or spectrum)
     * @param responseURI Optional URI to off-chain evidence
     * @param responseHash Optional hash of response content
     * @param tag Optional categorization tag
     */
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        ValidationStatus storage validation = _validations[requestHash];
        require(validation.exists, "Validation request not found");
        require(validation.validatorAddress == msg.sender, "Only designated validator can respond");
        require(response <= 100, "Response must be 0-100");

        validation.response = response;
        validation.responseHash = responseHash;
        validation.tag = tag;
        validation.lastUpdate = block.timestamp;

        emit ValidationResponse(
            msg.sender,
            validation.agentId,
            requestHash,
            response,
            responseURI,
            responseHash,
            tag
        );
    }

    /**
     * @notice Get validation status for a request
     * @param requestHash The request hash
     * @return validatorAddress The validator address
     * @return agentId The agent ID
     * @return response The validation response (0-100)
     * @return responseHash The response content hash
     * @return tag The response tag
     * @return lastUpdate The last update timestamp
     */
    function getValidationStatus(bytes32 requestHash) external view returns (
        address validatorAddress,
        uint256 agentId,
        uint8 response,
        bytes32 responseHash,
        string memory tag,
        uint256 lastUpdate
    ) {
        ValidationStatus storage validation = _validations[requestHash];
        return (
            validation.validatorAddress,
            validation.agentId,
            validation.response,
            validation.responseHash,
            validation.tag,
            validation.lastUpdate
        );
    }

    /**
     * @notice Get aggregated validation statistics for an agent
     * @param agentId The agent ID
     * @param validatorAddresses Optional filter by specific validators
     * @param tag Optional tag filter
     * @return count Number of validations
     * @return averageResponse Average response value
     */
    function getSummary(
        uint256 agentId,
        address[] calldata validatorAddresses,
        string calldata tag
    ) external view returns (
        uint64 count,
        uint8 averageResponse
    ) {
        bytes32[] storage requestHashes = _agentValidations[agentId];
        uint256 sum = 0;

        for (uint256 i = 0; i < requestHashes.length; i++) {
            ValidationStatus storage validation = _validations[requestHashes[i]];

            // Skip if no response yet
            if (validation.lastUpdate == 0) continue;

            // Apply validator filter if provided
            if (validatorAddresses.length > 0) {
                bool found = false;
                for (uint256 j = 0; j < validatorAddresses.length; j++) {
                    if (validation.validatorAddress == validatorAddresses[j]) {
                        found = true;
                        break;
                    }
                }
                if (!found) continue;
            }

            // Apply tag filter if provided
            if (bytes(tag).length > 0 && keccak256(bytes(validation.tag)) != keccak256(bytes(tag))) {
                continue;
            }

            count++;
            sum += validation.response;
        }

        if (count > 0) {
            averageResponse = uint8(sum / count);
        }
    }

    /**
     * @notice Get all validation request hashes for an agent
     * @param agentId The agent ID
     * @return Array of request hashes
     */
    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentValidations[agentId];
    }

    /**
     * @notice Get all validation request hashes for a validator
     * @param validatorAddress The validator address
     * @return Array of request hashes
     */
    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) {
        return _validatorRequests[validatorAddress];
    }

    /**
     * @notice Check if caller is owner or approved for the agent
     * @param spender The address to check
     * @param agentId The agent ID
     * @return True if approved or owner
     */
    function _isApprovedOrOwner(address spender, uint256 agentId) internal view returns (bool) {
        address owner = identityRegistry.ownerOf(agentId);
        return (spender == owner || 
                identityRegistry.isApprovedForAll(owner, spender) || 
                identityRegistry.getApproved(agentId) == spender);
    }

    /**
     * @notice Update the Identity Registry reference (owner only)
     * @param _identityRegistry New Identity Registry address
     */
    function setIdentityRegistry(address _identityRegistry) external onlyOwner {
        identityRegistry = IdentityRegistry(_identityRegistry);
    }
}
