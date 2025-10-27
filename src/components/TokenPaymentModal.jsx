import React, { useState, useEffect } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { ethers } from 'ethers';
import { 
  getAvailableTokens, 
  getTokenBalance, 
  getSolanaTokenBalance,
  validatePayment,
  calculateCredits,
  transferToPaymentWallet,
  verifyPayment,
  getPaymentWallet
} from '../services/paymentService';
import { X, CreditCard, Coins, RefreshCw, ChevronDown, ChevronUp, Wallet, Copy, Check, ExternalLink } from 'lucide-react';

const TokenPaymentModal = ({ isOpen, onClose }) => {
  const { 
    address, 
    credits, 
    fetchCredits,
    walletType,
    isNFTHolder
  } = useSimpleWallet();

  const [selectedToken, setSelectedToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableTokens, setAvailableTokens] = useState([]);
  const [tokenBalances, setTokenBalances] = useState({});
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [error, setError] = useState('');
  const [paymentAddress, setPaymentAddress] = useState('');
  const [solanaPaymentAddress, setSolanaPaymentAddress] = useState('');
  const [copied, setCopied] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(''); // 'pending', 'detected', 'confirmed'
  const [networksWithUSDC, setNetworksWithUSDC] = useState([]);
  const [currentNetworkBalance, setCurrentNetworkBalance] = useState(0);

  // Network detection and chain ID mapping
  const CHAIN_IDS = {
    1: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
    137: { name: 'Polygon', symbol: 'MATIC', decimals: 18 },
    42161: { name: 'Arbitrum', symbol: 'ETH', decimals: 18 },
    10: { name: 'Optimism', symbol: 'ETH', decimals: 18 },
    8453: { name: 'Base', symbol: 'ETH', decimals: 18 }
  };

  // Get current network info
  const getCurrentNetwork = async () => {
    try {
      if (walletType === 'evm' && window.ethereum) {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const chainIdNumber = parseInt(chainId, 16);
        const network = CHAIN_IDS[chainIdNumber];
        
        console.log(`🌐 Current network: ${network?.name || 'Unknown'} (Chain ID: ${chainIdNumber})`);
        return { chainId: chainIdNumber, network };
      }
      return null;
    } catch (error) {
      console.error('Error getting current network:', error);
      return null;
    }
  };

  // Build and send Solana USDC transaction
  const buildSolanaUSDCTransaction = async (amount, paymentAddress) => {
    try {
      if (!window.solana || !window.solana.isPhantom) {
        throw new Error('Phantom wallet not found');
      }

      const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
      const { createTransferInstruction, getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');

      // Connect to Solana mainnet using configured RPC
      const rpcUrl = process.env.REACT_APP_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl);
      
      // USDC mint address on Solana
      const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      
      // Get user's public key
      const userPublicKey = new PublicKey(address);
      const paymentPublicKey = new PublicKey(paymentAddress);
      
      // Get user's USDC token account
      const userTokenAccount = await getAssociatedTokenAddress(USDC_MINT, userPublicKey);
      
      // Get payment wallet's USDC token account
      const paymentTokenAccount = await getAssociatedTokenAddress(USDC_MINT, paymentPublicKey);
      
      // Check if user has USDC token account
      try {
        await getAccount(connection, userTokenAccount);
      } catch (error) {
        throw new Error('USDC token account not found. Please add USDC to your wallet first.');
      }
      
      // Convert amount to USDC units (6 decimals)
      const amountInUSDC = Math.floor(parseFloat(amount) * 1000000);
      
      // Create transfer instruction
      const transferInstruction = createTransferInstruction(
        userTokenAccount,    // source
        paymentTokenAccount, // destination
        userPublicKey,       // owner
        amountInUSDC         // amount
      );
      
      // Create transaction
      const transaction = new Transaction().add(transferInstruction);
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPublicKey;
      
      // Sign and send transaction
      const signedTransaction = await window.solana.signAndSendTransaction(transaction);
      
      console.log('✅ Solana transaction sent:', signedTransaction);
      return signedTransaction;
      
    } catch (error) {
      console.error('Error building Solana transaction:', error);
      throw error;
    }
  };

  // Load available tokens and payment address when modal opens
  useEffect(() => {
    if (isOpen) {
      // Only show USDC token - no native tokens
      const usdcToken = {
        symbol: 'USDC',
        name: 'USD Coin',
        creditRate: 10, // 1 USDC = 10 credits
        minAmount: 1,
        decimals: 6
      };
      
      setAvailableTokens([usdcToken]);
      setSelectedToken(usdcToken);
      
      // Set fallback addresses immediately
      setPaymentAddress('0xa0aE05e2766A069923B2a51011F270aCadFf023a');
      setSolanaPaymentAddress('CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA');
      
      // Try to get updated addresses from API
      fetchPaymentAddress();
    }
  }, [isOpen]);

  const fetchPaymentAddress = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/payment/get-address`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress: address })
      });
      
      const data = await response.json();
      if (data.success) {
        setPaymentAddress(data.paymentAddress); // EVM chains
        setSolanaPaymentAddress(data.solanaPaymentAddress); // Solana
      } else {
        // If API fails, use fallback addresses
        setPaymentAddress('0xa0aE05e2766A069923B2a51011F270aCadFf023a');
        setSolanaPaymentAddress('CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA');
      }
    } catch (error) {
      console.error('Error fetching payment address:', error);
      // Fallback to default payment addresses
      setPaymentAddress('0xa0aE05e2766A069923B2a51011F270aCadFf023a');
      setSolanaPaymentAddress('CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA');
    }
  };

  // Load token balances when token is selected
  useEffect(() => {
    if (selectedToken && address) {
      loadTokenBalance(selectedToken);
    }
  }, [selectedToken, address]);

  const loadTokenBalance = async (token) => {
    try {
      if (walletType === 'evm' && window.ethereum) {
        // Check USDC balance across all supported EVM networks
        await checkUSDCBalanceAcrossNetworks();
      } else {
        // Simplified - just set a placeholder balance for Solana
        setTokenBalances(prev => ({
          ...prev,
          [token.symbol]: '0.0'
        }));
      }
    } catch (error) {
      console.error('Error loading token balance:', error);
    }
  };

  // Check USDC balance across all supported EVM networks
  const checkUSDCBalanceAcrossNetworks = async () => {
    try {
      const networks = [
        { chainId: 1, name: 'Ethereum', usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
        { chainId: 137, name: 'Polygon', usdcAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
        { chainId: 42161, name: 'Arbitrum', usdcAddress: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' },
        { chainId: 10, name: 'Optimism', usdcAddress: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607' },
        { chainId: 8453, name: 'Base', usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }
      ];

      const usdcABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];

      const balances = {};
      let currentNetworkBalance = 0;
      let networksWithUSDC = [];

      // Check current network first
      const { chainId: currentChainId } = await getCurrentNetwork();
      
      for (const network of networks) {
        try {
          // Create provider for this network
          const provider = new ethers.JsonRpcProvider(getRPCUrl(network.chainId));
          const contract = new ethers.Contract(network.usdcAddress, usdcABI, provider);
          
          const [balance, decimals] = await Promise.all([
            contract.balanceOf(address),
            contract.decimals()
          ]);
          
          const formattedBalance = parseFloat(ethers.formatUnits(balance, decimals));
          balances[network.chainId] = {
            balance: formattedBalance,
            network: network.name,
            chainId: network.chainId
          };

          if (formattedBalance > 0) {
            networksWithUSDC.push({
              ...network,
              balance: formattedBalance
            });
          }

          if (network.chainId === currentChainId) {
            currentNetworkBalance = formattedBalance;
          }
        } catch (error) {
          console.log(`Could not check balance on ${network.name}:`, error.message);
        }
      }

      setTokenBalances(balances);
      setCurrentNetworkBalance(currentNetworkBalance);
      setNetworksWithUSDC(networksWithUSDC);

      // If user has USDC on other networks but not current one, show prompt
      if (networksWithUSDC.length > 0 && currentNetworkBalance === 0) {
        const currentNetwork = networks.find(n => n.chainId === currentChainId);
        const otherNetworks = networksWithUSDC.filter(n => n.chainId !== currentChainId);
        
        if (otherNetworks.length > 0) {
          const networkList = otherNetworks.map(n => `${n.name} (${n.balance.toFixed(2)} USDC)`).join(', ');
          setError(`💡 You have USDC on other networks: ${networkList}\n\nSwitch to one of these networks to use your USDC balance, or send USDC to ${currentNetwork?.name || 'current network'}.`);
        }
      }
    } catch (error) {
      console.error('Error checking USDC balance across networks:', error);
    }
  };

  // Get RPC URL for different networks
  const getRPCUrl = (chainId) => {
    const rpcUrls = {
      1: 'https://ethereum.publicnode.com',
      137: 'https://polygon.llamarpc.com', // Using publicnode.com causes CORS issues, keep llamarpc
      42161: 'https://arbitrum.llamarpc.com', // Using publicnode.com causes CORS issues, keep llamarpc
      10: 'https://optimism.llamarpc.com', // Using publicnode.com causes CORS issues, keep llamarpc
      8453: 'https://base.publicnode.com'
    };
    return rpcUrls[chainId] || 'https://ethereum.publicnode.com';
  };

  // Switch to a specific network
  const switchToNetwork = async (chainId) => {
    try {
      if (!window.ethereum) {
        throw new Error('Ethereum wallet not found');
      }

      const hexChainId = '0x' + chainId.toString(16);
      
      // Try to switch network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });

      // Refresh balances after switching
      setTimeout(() => {
        checkUSDCBalanceAcrossNetworks();
      }, 1000);

    } catch (switchError) {
      // If network doesn't exist, try to add it
      if (switchError.code === 4902) {
        try {
          await addNetwork(chainId);
        } catch (addError) {
          console.error('Failed to add network:', addError);
          setError(`Failed to add network. Please add it manually in your wallet.`);
        }
      } else {
        console.error('Failed to switch network:', switchError);
        setError(`Failed to switch network: ${switchError.message}`);
      }
    }
  };

  // Add network if it doesn't exist
  const addNetwork = async (chainId) => {
      const networkConfigs = {
      1: {
        chainId: '0x1',
        chainName: 'Ethereum Mainnet',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.ankr.com/eth', 'https://ethereum.publicnode.com'],
        blockExplorerUrls: ['https://etherscan.io']
      },
      137: {
        chainId: '0x89',
        chainName: 'Polygon Mainnet',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://rpc.ankr.com/polygon', 'https://polygon-rpc.com'],
        blockExplorerUrls: ['https://polygonscan.com']
      },
      42161: {
        chainId: '0xa4b1',
        chainName: 'Arbitrum One',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.ankr.com/arbitrum', 'https://arbitrum.publicnode.com'],
        blockExplorerUrls: ['https://arbiscan.io']
      },
      10: {
        chainId: '0xa',
        chainName: 'Optimism',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.ankr.com/optimism', 'https://optimism.publicnode.com'],
        blockExplorerUrls: ['https://optimistic.etherscan.io']
      },
      8453: {
        chainId: '0x2105',
        chainName: 'Base',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.ankr.com/base', 'https://base.publicnode.com'],
        blockExplorerUrls: ['https://basescan.org']
      }
    };

    const config = networkConfigs[chainId];
    if (!config) {
      throw new Error(`Network configuration not found for chain ID ${chainId}`);
    }

    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [config],
    });
  };

  const handleTokenSelect = (token) => {
    setSelectedToken(token);
    setShowTokenSelector(false);
    setAmount('');
    setError('');
  };

  const handleAmountChange = (value) => {
    setAmount(value);
    setError('');
  };

  const validateAmount = () => {
    if (!selectedToken || !amount) {
      setError('Please select a token and enter an amount');
      return false;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount');
      return false;
    }

    // Simplified validation
    if (numAmount <= 0) {
      setError('Amount must be greater than 0');
      return false;
    }

    return true;
  };

  const copyAddress = async () => {
    try {
      // Determine which address to copy based on selected token/chain
      // For now, use EVM address (could be enhanced to detect chain)
      const addressToCopy = paymentAddress;
      await navigator.clipboard.writeText(addressToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleSendTransaction = async () => {
    console.log('🚀 handleSendTransaction called', { 
      amount, 
      paymentAddress, 
      walletType, 
      address,
      isConnected: !!address 
    });
    
    if (!amount || !paymentAddress) {
      console.log('❌ Missing amount or payment address');
      setError('Please enter an amount and ensure payment address is loaded');
      return;
    }
    
    if (!address) {
      console.log('❌ No wallet connected');
      setError('Please connect your wallet first');
      return;
    }
    
    if (!walletType) {
      console.log('❌ No wallet type detected');
      setError('Wallet type not detected. Please reconnect your wallet');
      return;
    }
    
    try {
      setIsProcessing(true);
      setError('');
      
      console.log('🔍 Processing transaction for wallet type:', walletType);
      
      // Ensure wallet is still connected and working
      if (walletType === 'solana') {
        if (!window.solana || !window.solana.isPhantom) {
          throw new Error('Phantom wallet not found. Please install Phantom wallet and refresh the page.');
        }
        
        // Check if wallet is connected
        if (!window.solana.isConnected) {
          console.log('🔄 Reconnecting to Phantom...');
          try {
            const response = await window.solana.connect();
            if (!response || !response.publicKey) {
              throw new Error('Failed to connect to Phantom wallet. Please unlock your wallet and try again.');
            }
            console.log('✅ Phantom wallet reconnected successfully');
          } catch (connectError) {
            throw new Error(`Failed to connect to Phantom wallet: ${connectError.message}`);
          }
        }
        
        // Verify the connected account matches the expected address
        if (window.solana.publicKey && window.solana.publicKey.toString() !== address) {
          console.log('⚠️ Wallet address mismatch, updating...');
          // This shouldn't happen in normal flow, but handle gracefully
        }
      } else {
        if (!window.ethereum) {
          throw new Error('EVM wallet not found. Please refresh and reconnect.');
        }
        
        // Test if we can get accounts
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found. Please reconnect your wallet.');
          }
        } catch (e) {
          throw new Error('Wallet connection lost. Please reconnect your wallet.');
        }
      }
      
      if (walletType === 'solana') {
        console.log('🔍 Processing Solana USDC payment...');
        
        try {
          // Build and send Solana USDC transaction
          const solanaTx = await buildSolanaUSDCTransaction(amount, solanaPaymentAddress);
          
          if (solanaTx) {
            console.log('✅ Solana transaction sent:', solanaTx);
            setError(`✅ Solana USDC transaction sent! Hash: ${solanaTx}\n\n${amount} USDC sent to ${solanaPaymentAddress}. Checking for instant credit addition...`);
            
            // Start checking immediately for Solana
            const immediateCheck = setTimeout(() => {
              checkForPayment();
            }, 200); // Check after 200ms for immediate detection
            
            // Also trigger regular payment check
            setTimeout(() => {
              checkForPayment();
            }, 100); // Check after 100ms for instant detection
          } else {
            // Fallback to copying address if transaction fails
            await navigator.clipboard.writeText(solanaPaymentAddress);
            setError(`✅ Solana USDC payment address copied to clipboard: ${solanaPaymentAddress}\n\nPlease send ${amount} USDC to this address and click "Check Payment" to verify.`);
          }
        } catch (solanaError) {
          console.error('❌ Solana transaction failed:', solanaError);
          
          // Show specific error message
          let errorMessage = 'Solana transaction failed. ';
          if (solanaError.message.includes('User rejected')) {
            errorMessage += 'Transaction was cancelled by user.';
          } else if (solanaError.message.includes('Insufficient funds')) {
            errorMessage += 'Insufficient USDC balance. Please add USDC to your wallet.';
          } else if (solanaError.message.includes('token account not found')) {
            errorMessage += 'USDC token account not found. Please add USDC to your wallet first.';
          } else if (solanaError.message.includes('Phantom wallet not found')) {
            errorMessage += 'Phantom wallet not found. Please install and connect Phantom wallet.';
          } else {
            errorMessage += `Error: ${solanaError.message}`;
          }
          
          setError(errorMessage + `\n\nAs a fallback, payment address copied to clipboard: ${solanaPaymentAddress}`);
          
          // Fallback to copying address
          await navigator.clipboard.writeText(solanaPaymentAddress);
        }
      } else {
        console.log('🔍 Processing USDC payment...');
        
        try {
          // Get current network info
          const { chainId, network } = await getCurrentNetwork();
          
          if (!chainId || !network) {
            throw new Error('Unable to detect current network. Please switch to a supported network.');
          }
          
          // Get the current provider
          let provider = window.ethereum;
          if (window.ethereum.providers?.length > 0) {
            // Multiple wallets, find the one that's connected
            provider = window.ethereum.providers.find(p => p.isMetaMask || p.isRabby || p.isCoinbaseWallet) || window.ethereum;
          }
          
          const ethersProvider = new ethers.BrowserProvider(provider);
          const signer = await ethersProvider.getSigner();
          
          console.log(`🔨 Creating USDC transaction on ${network.name}...`);
          
          // USDC contract addresses for different networks (MUST match backend TOKEN_ADDRESSES)
          const USDC_CONTRACTS = {
            1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum USDC
            137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon
            42161: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // Arbitrum
            10: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // Optimism
            8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base
          };
          
          const usdcAddress = USDC_CONTRACTS[chainId];
          if (!usdcAddress) {
            throw new Error(`USDC not supported on ${network.name}. Please switch to Ethereum, Polygon, Arbitrum, Optimism, or Base.`);
          }
          
          // USDC ABI (minimal for transfer)
          const usdcABI = [
            "function transfer(address to, uint256 amount) returns (bool)",
            "function balanceOf(address owner) view returns (uint256)",
            "function decimals() view returns (uint8)",
            "function symbol() view returns (string)"
          ];
          
          const usdcContract = new ethers.Contract(usdcAddress, usdcABI, signer);
          
          // Check USDC balance
          const balance = await usdcContract.balanceOf(address);
          const decimals = await usdcContract.decimals();
          const balanceFormatted = ethers.formatUnits(balance, decimals);
          
          console.log(`💰 USDC Balance: ${balanceFormatted} USDC`);
          
          if (parseFloat(balanceFormatted) < parseFloat(amount)) {
            throw new Error(`Insufficient USDC balance. You have ${balanceFormatted} USDC but need ${amount} USDC.`);
          }
          
          // Convert amount to USDC units (6 decimals)
          const amountWei = ethers.parseUnits(amount, 6);
          
          console.log(`📤 Building USDC transaction to send ${amount} USDC to ${paymentAddress}...`);
          
          // Build the transaction data
          const txData = usdcContract.interface.encodeFunctionData('transfer', [paymentAddress, amountWei]);
          
          // Get gas estimate
          const gasEstimate = await usdcContract.transfer.estimateGas(paymentAddress, amountWei);
          const gasPrice = await ethersProvider.getFeeData();
          
          // Build transaction object
          const transaction = {
            to: usdcAddress,
            from: address,
            data: txData,
            gasLimit: gasEstimate,
            gasPrice: gasPrice.gasPrice,
            value: 0 // No ETH value for token transfer
          };
          
          console.log('🔨 Transaction built:', transaction);
          
          // Send transaction to wallet
          const tx = await signer.sendTransaction(transaction);
          
          console.log('⏳ Transaction submitted:', tx.hash);
          setError(`⏳ USDC transaction submitted! Hash: ${tx.hash}\n\nWaiting for confirmation...`);
          
          // Start checking immediately while waiting for confirmation
          const immediateCheck = setTimeout(() => {
            checkForPayment();
          }, 200); // Check after 200ms for immediate detection
          
          // Wait for transaction confirmation
          const receipt = await tx.wait();
          
          // Clear the immediate check since we got confirmation
          clearTimeout(immediateCheck);
          
          if (receipt.status === 1) {
            console.log('✅ USDC transaction confirmed!');
            setError(`✅ USDC transaction confirmed! Hash: ${tx.hash}\n\n${amount} USDC sent to ${paymentAddress}. Checking for instant credit addition...`);
            
            // Trigger instant payment check
            setTimeout(() => {
              checkForPayment();
            }, 100); // Check after 100ms for instant detection
          } else {
            throw new Error('Transaction failed');
          }
          
        } catch (usdcError) {
          console.error('❌ USDC transaction failed:', usdcError);
          
          if (usdcError.code === 4001 || usdcError.message.includes('User rejected') || usdcError.message.includes('user rejected')) {
            setError('Transaction cancelled by user.');
          } else if (usdcError.message.includes('insufficient') || usdcError.message.includes('balance')) {
            setError(`Insufficient USDC balance: ${usdcError.message}`);
          } else {
            setError(`USDC transaction failed: ${usdcError.message}`);
          }
        }
      }
    } catch (error) {
      console.error('Error sending transaction:', error);
      
      // Show specific error message based on error type
      let errorMessage = 'Transaction failed. ';
      if (error.message.includes('wallet not found')) {
        errorMessage += 'Wallet not found. Please install and connect your wallet.';
      } else if (error.message.includes('No accounts found')) {
        errorMessage += 'No wallet accounts found. Please unlock your wallet and try again.';
      } else if (error.message.includes('User rejected')) {
        errorMessage += 'Transaction was cancelled by user.';
      } else if (error.message.includes('Insufficient funds')) {
        errorMessage += 'Insufficient balance. Please add funds to your wallet.';
      } else {
        errorMessage += `Error: ${error.message}`;
      }
      
      setError(errorMessage + '\n\nAs a fallback, payment address copied to clipboard for manual sending.');
    } finally {
      setIsProcessing(false);
    }
  };

  const checkForPayment = async () => {
    if (!address || !amount) {
      setError('Please enter an amount');
      return;
    }
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1) {
      setError('Minimum amount is 1 USDC');
      return;
    }
    
    setCheckingPayment(true);
    setPaymentStatus('pending');
    setError('');
    
    // Get current network to pass to backend
    const { chainId } = await getCurrentNetwork();
    
    // Start instant payment detection - check every 200ms for near-instant detection
    const checkInterval = setInterval(async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        console.log('[Payment] Instant checking for payment:', {
          walletAddress: address,
          expectedAmount: numAmount,
          token: 'USDC',
          chainId: chainId
        });
        
        // Use instant-check endpoint for faster detection
        const response = await fetch(`${apiUrl}/api/payment/instant-check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: address,
            expectedAmount: numAmount,
            token: 'USDC',
            chainId: chainId // Pass the current chain ID
          })
        });
        
        const data = await response.json();
        console.log('[Payment] Instant check result:', data);
        
        if (data.success && data.paymentDetected) {
          console.log('[Payment] Payment detected instantly!', data.payment);
          clearInterval(checkInterval);
          setPaymentStatus('confirmed');
          setCheckingPayment(false);
          
          // Poll for credits update with retry logic
          let creditsUpdated = false;
          for (let retry = 0; retry < 10; retry++) {
            console.log(`[Credits] Refreshing credits (attempt ${retry + 1}/10)...`);
            
            const refreshedCredits = await fetchCredits(address);
            
            // Check if credits were actually updated
            if (refreshedCredits !== undefined && refreshedCredits > 0) {
              console.log(`[Credits] Credits updated successfully: ${refreshedCredits}`);
              creditsUpdated = true;
              break;
            }
            
            // Wait 500ms before next retry
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          if (creditsUpdated) {
            setError(`✅ Payment confirmed! ${numAmount} USDC received. Credits updated successfully!`);
          } else {
            setError(`✅ Payment confirmed! ${numAmount} USDC received. Credits will be added shortly.`);
          }
          
          setTimeout(() => {
            onClose();
          }, 1000);
        }
      } catch (error) {
        console.error('[Payment] Error checking payment:', error);
        // Don't stop checking on individual errors, keep trying
      }
    }, 200); // Check every 200ms for near-instant detection
    
    // Stop checking after 2 minutes to prevent infinite checking
    setTimeout(() => {
      clearInterval(checkInterval);
      if (paymentStatus === 'pending') {
        setCheckingPayment(false);
        setPaymentStatus('');
        setError('Payment not detected after 2 minutes. Please try again or contact support.');
      }
    }, 120000); // 2 minutes timeout
  };

  const handlePayment = () => {
    if (!validateAmount()) return;
    
    checkForPayment();
  };
  
  const stopMonitoring = () => {
    setPaymentStatus('');
    setCheckingPayment(false);
    setError('');
  };

  const getCreditsPreview = () => {
    if (!selectedToken || !amount) return 0;
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return 0;
    
    // NFT holders: $0.10 per generation (10 credits per USDC)
    // Non-holders: $0.15 per generation (6.67 credits per USDC)
    const creditsPerUSDC = isNFTHolder ? 10 : 6.67;
    return Math.floor(numAmount * creditsPerUSDC);
  };

  const getTokenBalance = (tokenSymbol) => {
    return tokenBalances[tokenSymbol]?.formattedBalance || '0';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2">
      <div className="bg-gray-900 rounded-xl border border-white/20 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Buy Credits</h2>
              <p className="text-sm text-gray-400">Purchase credits with tokens</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Current Credits */}
          <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Current Credits:</span>
              <span className="text-lg font-semibold text-purple-400">
                {credits}
              </span>
            </div>
          </div>



          {/* Payment Method - USDC Only */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">
              Payment Method
            </label>
            
            <div className="w-full flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  $
                </div>
                <div className="text-left">
                  <div className="font-semibold text-white">Pay with USDC</div>
                  <div className="text-xs text-blue-300">USD Coin on {walletType === 'solana' ? 'Solana' : 'EVM Chains'}</div>
                </div>
              </div>
              <div className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded-full">
                Active
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="Enter USDC amount"
                className="w-full p-3 pr-16 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                step="0.1"
                min="1"
                id="token-amount-input"
                name="token-amount"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm font-semibold text-blue-400">
                USDC
              </div>
            </div>
            <div className="text-xs text-gray-400">
              Minimum: 1 USDC
            </div>
          </div>

          {/* Credits Preview */}
          <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">You'll receive:</span>
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                {getCreditsPreview()} Credits
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Rate:</span>
              <span className="text-purple-400 font-semibold">
                1 USDC = {isNFTHolder ? '10' : '6.67'} Credits
                {isNFTHolder && <span className="text-green-400 ml-1">(NFT Holder)</span>}
              </span>
            </div>
          </div>

          {/* Payment Address */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400">
                {walletType === 'solana' ? 'Solana Payment Address' : 'EVM Payment Address'}
              </span>
            </div>
            
            {/* Show only relevant payment address based on connected wallet type */}
            {walletType === 'solana' ? (
              // Solana Payment Address
              <div className="space-y-2">
                <div className="text-xs text-purple-400 font-semibold">Solana Network:</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2 bg-black/30 rounded border border-white/10 text-xs font-mono text-white break-all">
                    {solanaPaymentAddress || 'Loading...'}
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(solanaPaymentAddress);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch (error) {
                        console.error('Failed to copy:', error);
                      }
                    }}
                    className="p-2 hover:bg-white/10 rounded transition-colors"
                    title="Copy Solana address"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              // EVM Payment Address
              <div className="space-y-2">
                <div className="text-xs text-purple-400 font-semibold">
                  EVM Networks (Ethereum, Polygon, Arbitrum, Optimism, Base):
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2 bg-black/30 rounded border border-white/10 text-xs font-mono text-white break-all">
                    {paymentAddress || 'Loading...'}
                  </div>
                  <button
                    onClick={copyAddress}
                    className="p-2 hover:bg-white/10 rounded transition-colors"
                    title="Copy EVM address"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Send Transaction Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleSendTransaction}
                disabled={!amount || !paymentAddress || isProcessing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                {isProcessing ? 'Opening Wallet...' : `Open Wallet & Send ${amount || '0'} USDC`}
              </button>
              
              {/* Alternative: Deep Link for Mobile */}
              {walletType === 'evm' && (
                <button
                  onClick={() => {
                    const deepLink = `ethereum:${paymentAddress}@1?value=${ethers.parseUnits(amount || '0', 6).toString()}&gas=21000`;
                    window.open(deepLink, '_blank');
                  }}
                  disabled={!amount || !paymentAddress}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
                >
                  <Wallet className="w-4 h-4" />
                  Open in Mobile Wallet
                </button>
              )}
              
              <div className="text-center text-xs text-gray-400">
                This will open your wallet with the payment pre-filled
              </div>
            </div>

            {/* Clear Instructions */}
            <div className="bg-black/20 p-2 rounded border border-white/10">
              <div className="text-xs text-white font-semibold mb-2">📋 How to Pay:</div>
              <div className="text-xs text-gray-300 space-y-1">
                <p><strong>1.</strong> Click "Open Wallet & Send USDC" above</p>
                <p><strong>2.</strong> Confirm the transaction in your wallet</p>
                <p><strong>3.</strong> Credits added instantly after confirmation!</p>
                <p className="text-green-300"><strong>⚡ Ultra-Fast:</strong> Payment detection every 0.5 seconds</p>
                <p className="text-blue-300"><strong>Note:</strong> Transaction is pre-built and ready to send</p>
              </div>
            </div>
            
            {/* Payment Status */}
            {paymentStatus && (
              <div className={`p-2 rounded text-xs ${
                paymentStatus === 'confirmed' 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {paymentStatus === 'pending' && '⏳ Monitoring for payment...'}
                {paymentStatus === 'detected' && '👀 Payment detected! Confirming...'}
                {paymentStatus === 'confirmed' && '✅ Payment confirmed! Credits added.'}
              </div>
            )}
          </div>

          {/* Network Switching Options */}
          {networksWithUSDC.length > 0 && currentNetworkBalance === 0 && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm">💡</span>
                </div>
                <h3 className="text-blue-400 font-semibold">Switch Network to Use Your USDC</h3>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-gray-300 mb-3">
                  You have USDC on other networks. Switch to use your existing balance:
                </p>
                
                <div className="grid grid-cols-1 gap-2">
                  {networksWithUSDC.map((network) => (
                    <button
                      key={network.chainId}
                      onClick={() => switchToNetwork(network.chainId)}
                      className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">
                            {network.chainId === 1 ? '⟠' : 
                             network.chainId === 137 ? '⬟' :
                             network.chainId === 42161 ? '🔷' :
                             network.chainId === 10 ? '🔴' : '🔵'}
                          </span>
                        </div>
                        <div className="text-left">
                          <div className="text-white font-semibold">{network.name}</div>
                          <div className="text-xs text-gray-400">Chain ID: {network.chainId}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-green-400 font-semibold">{network.balance.toFixed(2)} USDC</div>
                        <div className="text-xs text-gray-400">Click to switch</div>
                      </div>
                    </button>
                  ))}
                </div>
                
                <div className="text-xs text-gray-400 mt-2">
                  💡 Switching networks will automatically refresh your USDC balance
                </div>
              </div>
            </div>
          )}

          {/* Current Network Balance */}
          {currentNetworkBalance > 0 && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-400 font-semibold">Current Network USDC Balance:</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-400">{currentNetworkBalance.toFixed(2)} USDC</span>
                  <button
                    onClick={() => checkUSDCBalanceAcrossNetworks()}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                    title="Refresh balance"
                  >
                    <RefreshCw className="w-4 h-4 text-green-400" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {paymentStatus === 'pending' ? (
              <>
                <button
                  onClick={stopMonitoring}
                  className="flex-1 btn-secondary py-3"
                >
                  Stop Monitoring
                </button>
                <button
                  disabled
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 opacity-90"
                >
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Checking...</span>
                </button>
              </>
            ) : paymentStatus === 'confirmed' ? (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Done</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 btn-secondary py-3"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayment}
                  disabled={!amount || parseFloat(amount) < 1}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Coins className="w-4 h-4" />
                  <span>Start Monitoring</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenPaymentModal;
