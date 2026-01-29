import { ethers, network, run } from "hardhat";

async function main() {
  console.log("Deploying ERC-8004 Trustless Agents contracts...");
  console.log("Network:", network.name);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy Identity Registry
  console.log("\n1. Deploying IdentityRegistry...");
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.waitForDeployment();
  const identityRegistryAddress = await identityRegistry.getAddress();
  console.log("IdentityRegistry deployed to:", identityRegistryAddress);

  // Deploy Reputation Registry
  console.log("\n2. Deploying ReputationRegistry...");
  const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
  const reputationRegistry = await ReputationRegistry.deploy(identityRegistryAddress);
  await reputationRegistry.waitForDeployment();
  const reputationRegistryAddress = await reputationRegistry.getAddress();
  console.log("ReputationRegistry deployed to:", reputationRegistryAddress);

  // Deploy Validation Registry
  console.log("\n3. Deploying ValidationRegistry...");
  const ValidationRegistry = await ethers.getContractFactory("ValidationRegistry");
  const validationRegistry = await ValidationRegistry.deploy(identityRegistryAddress);
  await validationRegistry.waitForDeployment();
  const validationRegistryAddress = await validationRegistry.getAddress();
  console.log("ValidationRegistry deployed to:", validationRegistryAddress);

  // Summary
  console.log("\n========================================");
  console.log("ERC-8004 Deployment Complete!");
  console.log("========================================");
  console.log("Network:", network.name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId.toString());
  console.log("");
  console.log("Contract Addresses:");
  console.log("  IdentityRegistry:   ", identityRegistryAddress);
  console.log("  ReputationRegistry: ", reputationRegistryAddress);
  console.log("  ValidationRegistry: ", validationRegistryAddress);
  console.log("");
  console.log("Agent Registry Format: eip155:{chainId}:" + identityRegistryAddress);
  console.log("========================================");

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      IdentityRegistry: identityRegistryAddress,
      ReputationRegistry: reputationRegistryAddress,
      ValidationRegistry: validationRegistryAddress,
    },
    agentRegistry: `eip155:${(await ethers.provider.getNetwork()).chainId}:${identityRegistryAddress}`,
  };

  // Write deployment info to file
  const fs = await import("fs");
  const deploymentPath = `./deployments/${network.name}-deployment.json`;
  
  // Create deployments directory if it doesn't exist
  if (!fs.existsSync("./deployments")) {
    fs.mkdirSync("./deployments", { recursive: true });
  }
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to:", deploymentPath);

  // Verify contracts on Etherscan if not on localhost
  if (network.name !== "localhost" && network.name !== "hardhat") {
    console.log("\nWaiting for block confirmations before verification...");
    
    // Wait for a few blocks
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log("\nVerifying contracts on block explorer...");

    try {
      await run("verify:verify", {
        address: identityRegistryAddress,
        constructorArguments: [],
      });
      console.log("IdentityRegistry verified!");
    } catch (e: any) {
      console.log("IdentityRegistry verification failed:", e.message);
    }

    try {
      await run("verify:verify", {
        address: reputationRegistryAddress,
        constructorArguments: [identityRegistryAddress],
      });
      console.log("ReputationRegistry verified!");
    } catch (e: any) {
      console.log("ReputationRegistry verification failed:", e.message);
    }

    try {
      await run("verify:verify", {
        address: validationRegistryAddress,
        constructorArguments: [identityRegistryAddress],
      });
      console.log("ValidationRegistry verified!");
    } catch (e: any) {
      console.log("ValidationRegistry verification failed:", e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
