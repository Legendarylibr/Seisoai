import { ethers, network } from "hardhat";
import * as fs from "fs";

// Example agent registration data
const AGENT_REGISTRATIONS = [
  {
    name: "Seisoai ChatAssistant",
    description: "AI assistant for creative content generation including images, videos, and music",
    image: "https://seisoai.com/seiso-logo.png",
    services: [
      { name: "web", endpoint: "https://seisoai.com/" },
      { name: "MCP", endpoint: "https://api.seisoai.com/mcp", version: "2025-06-18" }
    ],
    active: true,
    supportedTrust: ["reputation"]
  },
  {
    name: "Seisoai Image Generator",
    description: "AI-powered image generation using state-of-the-art diffusion models",
    image: "https://seisoai.com/seiso-logo.png",
    services: [
      { name: "web", endpoint: "https://seisoai.com/generate" },
    ],
    active: true,
    supportedTrust: ["reputation"]
  },
  {
    name: "Seisoai Video Generator",
    description: "AI video creation and editing service",
    image: "https://seisoai.com/seiso-logo.png",
    services: [
      { name: "web", endpoint: "https://seisoai.com/video" },
    ],
    active: true,
    supportedTrust: ["reputation"]
  },
  {
    name: "Seisoai Music Generator",
    description: "AI music and audio generation service with stem mixing",
    image: "https://seisoai.com/seiso-logo.png",
    services: [
      { name: "web", endpoint: "https://seisoai.com/music" },
    ],
    active: true,
    supportedTrust: ["reputation"]
  }
];

async function main() {
  console.log("Registering Seisoai AI Agents...");
  console.log("Network:", network.name);

  // Load deployment info
  const deploymentPath = `./deployments/${network.name}-deployment.json`;
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}. Run deploy-erc8004.ts first.`);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const identityRegistryAddress = deploymentInfo.contracts.IdentityRegistry;

  console.log("Using IdentityRegistry at:", identityRegistryAddress);

  const [deployer] = await ethers.getSigners();
  console.log("Registering as:", deployer.address);

  // Get contract instance
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = IdentityRegistry.attach(identityRegistryAddress);

  const registeredAgents = [];

  for (const agentData of AGENT_REGISTRATIONS) {
    console.log(`\nRegistering: ${agentData.name}`);

    // Create ERC-8004 compliant registration file
    const registrationFile = {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: agentData.name,
      description: agentData.description,
      image: agentData.image,
      services: agentData.services,
      active: agentData.active,
      supportedTrust: agentData.supportedTrust,
      registrations: [] // Will be updated after registration
    };

    // For development, use base64 data URI
    // In production, you would upload to IPFS and use ipfs:// URI
    const base64Data = Buffer.from(JSON.stringify(registrationFile)).toString("base64");
    const agentURI = `data:application/json;base64,${base64Data}`;

    // Register the agent
    const tx = await identityRegistry.connect(deployer)["register(string)"](agentURI);
    const receipt = await tx.wait();

    // Get the agentId from the Registered event
    const event = receipt?.logs.find(
      (log: any) => log.topics[0] === identityRegistry.interface.getEvent("Registered")?.topicHash
    );

    let agentId;
    if (event) {
      const parsed = identityRegistry.interface.parseLog({
        topics: event.topics as string[],
        data: event.data
      });
      agentId = parsed?.args.agentId;
    }

    console.log(`  Agent ID: ${agentId}`);
    console.log(`  Transaction: ${tx.hash}`);

    registeredAgents.push({
      name: agentData.name,
      agentId: agentId?.toString(),
      agentRegistry: deploymentInfo.agentRegistry,
      transactionHash: tx.hash,
    });
  }

  // Summary
  console.log("\n========================================");
  console.log("Agent Registration Complete!");
  console.log("========================================");
  
  for (const agent of registeredAgents) {
    console.log(`\n${agent.name}:`);
    console.log(`  Agent ID: ${agent.agentId}`);
    console.log(`  Registry: ${agent.agentRegistry}`);
  }

  // Save registration info
  const registrationPath = `./deployments/${network.name}-agents.json`;
  fs.writeFileSync(registrationPath, JSON.stringify(registeredAgents, null, 2));
  console.log("\nRegistration info saved to:", registrationPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
