// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/**
 * @title IdentityRegistry
 * @notice ERC-8004 Identity Registry - Agent registration using ERC-721 with URIStorage
 * @dev Implements the Identity Registry component of ERC-8004 Trustless Agents standard
 */
contract IdentityRegistry is ERC721URIStorage, EIP712, Ownable {
    using ECDSA for bytes32;

    // Counter for agent IDs (tokenIds)
    uint256 private _nextAgentId;

    // Mapping from agentId to metadata key to metadata value
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    // Mapping from agentId to agent wallet address
    mapping(uint256 => address) private _agentWallets;

    // EIP-712 typehash for wallet change authorization
    bytes32 public constant WALLET_CHANGE_TYPEHASH = 
        keccak256("WalletChange(uint256 agentId,address newWallet,uint256 deadline)");

    // Reserved metadata key
    string public constant RESERVED_AGENT_WALLET_KEY = "agentWallet";

    // Events
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId, 
        string indexed indexedMetadataKey, 
        string metadataKey, 
        bytes metadataValue
    );
    event AgentWalletSet(uint256 indexed agentId, address indexed newWallet);
    event AgentWalletUnset(uint256 indexed agentId);

    /**
     * @notice Struct for batch metadata entries during registration
     */
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    constructor() 
        ERC721("ERC8004 Agent", "AGENT") 
        EIP712("ERC8004IdentityRegistry", "1")
        Ownable(msg.sender)
    {
        _nextAgentId = 1; // Start from 1
    }

    /**
     * @notice Register a new agent with URI and optional metadata
     * @param agentURI The URI pointing to the agent registration file
     * @param metadata Array of metadata entries to set during registration
     * @return agentId The newly minted agent ID
     */
    function register(
        string calldata agentURI, 
        MetadataEntry[] calldata metadata
    ) external returns (uint256 agentId) {
        agentId = _nextAgentId++;
        
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        
        // Set initial agent wallet to owner
        _agentWallets[agentId] = msg.sender;
        emit MetadataSet(agentId, RESERVED_AGENT_WALLET_KEY, RESERVED_AGENT_WALLET_KEY, abi.encode(msg.sender));
        
        // Set additional metadata (excluding reserved keys)
        for (uint256 i = 0; i < metadata.length; i++) {
            require(
                keccak256(bytes(metadata[i].metadataKey)) != keccak256(bytes(RESERVED_AGENT_WALLET_KEY)),
                "Cannot set reserved key via register"
            );
            _metadata[agentId][metadata[i].metadataKey] = metadata[i].metadataValue;
            emit MetadataSet(agentId, metadata[i].metadataKey, metadata[i].metadataKey, metadata[i].metadataValue);
        }
        
        emit Registered(agentId, agentURI, msg.sender);
    }

    /**
     * @notice Register a new agent with URI only
     * @param agentURI The URI pointing to the agent registration file
     * @return agentId The newly minted agent ID
     */
    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _nextAgentId++;
        
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        
        // Set initial agent wallet to owner
        _agentWallets[agentId] = msg.sender;
        emit MetadataSet(agentId, RESERVED_AGENT_WALLET_KEY, RESERVED_AGENT_WALLET_KEY, abi.encode(msg.sender));
        
        emit Registered(agentId, agentURI, msg.sender);
    }

    /**
     * @notice Register a new agent without URI (to be set later)
     * @return agentId The newly minted agent ID
     */
    function register() external returns (uint256 agentId) {
        agentId = _nextAgentId++;
        
        _safeMint(msg.sender, agentId);
        
        // Set initial agent wallet to owner
        _agentWallets[agentId] = msg.sender;
        emit MetadataSet(agentId, RESERVED_AGENT_WALLET_KEY, RESERVED_AGENT_WALLET_KEY, abi.encode(msg.sender));
        
        emit Registered(agentId, "", msg.sender);
    }

    /**
     * @notice Update the agent URI
     * @param agentId The agent ID to update
     * @param newURI The new URI
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(_isApprovedOrOwner(msg.sender, agentId), "Not owner or approved");
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    /**
     * @notice Set agent wallet with signature verification
     * @param agentId The agent ID
     * @param newWallet The new wallet address
     * @param deadline Signature expiration timestamp
     * @param signature The EIP-712 or ERC-1271 signature from the new wallet
     */
    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(_isApprovedOrOwner(msg.sender, agentId), "Not owner or approved");
        require(block.timestamp <= deadline, "Signature expired");
        require(newWallet != address(0), "Invalid wallet address");

        bytes32 structHash = keccak256(abi.encode(
            WALLET_CHANGE_TYPEHASH,
            agentId,
            newWallet,
            deadline
        ));
        bytes32 hash = _hashTypedDataV4(structHash);

        // Support both EOA (EIP-712) and smart contract wallets (ERC-1271)
        require(
            SignatureChecker.isValidSignatureNow(newWallet, hash, signature),
            "Invalid signature"
        );

        _agentWallets[agentId] = newWallet;
        emit AgentWalletSet(agentId, newWallet);
        emit MetadataSet(agentId, RESERVED_AGENT_WALLET_KEY, RESERVED_AGENT_WALLET_KEY, abi.encode(newWallet));
    }

    /**
     * @notice Unset the agent wallet (reset to zero address)
     * @param agentId The agent ID
     */
    function unsetAgentWallet(uint256 agentId) external {
        require(_isApprovedOrOwner(msg.sender, agentId), "Not owner or approved");
        delete _agentWallets[agentId];
        emit AgentWalletUnset(agentId);
        emit MetadataSet(agentId, RESERVED_AGENT_WALLET_KEY, RESERVED_AGENT_WALLET_KEY, abi.encode(address(0)));
    }

    /**
     * @notice Get the agent wallet address
     * @param agentId The agent ID
     * @return The wallet address or zero address if not set
     */
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallets[agentId];
    }

    /**
     * @notice Get metadata for an agent
     * @param agentId The agent ID
     * @param metadataKey The metadata key
     * @return The metadata value as bytes
     */
    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory) {
        if (keccak256(bytes(metadataKey)) == keccak256(bytes(RESERVED_AGENT_WALLET_KEY))) {
            return abi.encode(_agentWallets[agentId]);
        }
        return _metadata[agentId][metadataKey];
    }

    /**
     * @notice Set metadata for an agent
     * @param agentId The agent ID
     * @param metadataKey The metadata key
     * @param metadataValue The metadata value
     */
    function setMetadata(
        uint256 agentId, 
        string memory metadataKey, 
        bytes memory metadataValue
    ) external {
        require(_isApprovedOrOwner(msg.sender, agentId), "Not owner or approved");
        require(
            keccak256(bytes(metadataKey)) != keccak256(bytes(RESERVED_AGENT_WALLET_KEY)),
            "Cannot set reserved key via setMetadata"
        );
        
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    /**
     * @notice Get the agent URI (alias for tokenURI)
     * @param agentId The agent ID
     * @return The agent URI
     */
    function agentURI(uint256 agentId) external view returns (string memory) {
        return tokenURI(agentId);
    }

    /**
     * @notice Check if caller is owner or approved for the agent
     * @param spender The address to check
     * @param agentId The agent ID
     * @return True if approved or owner
     */
    function _isApprovedOrOwner(address spender, uint256 agentId) internal view returns (bool) {
        address owner = ownerOf(agentId);
        return (spender == owner || 
                isApprovedForAll(owner, spender) || 
                getApproved(agentId) == spender);
    }

    /**
     * @notice Override transfer to clear agent wallet on transfer
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = super._update(to, tokenId, auth);
        
        // Clear agent wallet on transfer (except for minting)
        if (from != address(0) && to != address(0)) {
            delete _agentWallets[tokenId];
            emit AgentWalletUnset(tokenId);
        }
        
        return from;
    }

    /**
     * @notice Get the next agent ID that will be assigned
     * @return The next agent ID
     */
    function nextAgentId() external view returns (uint256) {
        return _nextAgentId;
    }

    /**
     * @notice Get the EIP-712 domain separator
     * @return The domain separator
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
