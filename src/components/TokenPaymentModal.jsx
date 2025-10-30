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
    setCreditsManually,
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
      const { 
        createTransferInstruction, 
        getAssociatedTokenAddress, 
        getAccount,
        createAssociatedTokenAccountInstruction,
        getAssociatedTokenAddressSync,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      } = await import('@solana/spl-token');

      // Connect to Solana mainnet using configured RPC with better fallbacks
      // Ensure we always have fallback RPCs even if env var is missing
      const envRpcUrl = import.meta.env.VITE_SOLANA_RPC_URL;
      const rpcUrls = [
        ...(envRpcUrl && envRpcUrl.trim() ? [envRpcUrl.trim()] : []),
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://rpc.ankr.com/solana',
        'https://solana-mainnet.g.alchemy.com/v2/demo',
        'https://mainnet.helius-rpc.com'
      ].filter(url => url && typeof url === 'string' && url.length > 0);
      
      if (rpcUrls.length === 0) {
        throw new Error('No Solana RPC endpoints available. Please configure VITE_SOLANA_RPC_URL in your environment.');
      }
      
      let connection = null;
      let rpcUrl = rpcUrls[0];
      let lastError = null;
      const failedRpcs = [];
      
      // Try each RPC endpoint until one works with better error handling
      for (const url of rpcUrls) {
        try {
          console.log(`🔗 Trying Solana RPC: ${url}`);
          const testConnection = new Connection(url, {
            commitment: 'confirmed',
            disableRetryOnRateLimit: false
          });
          // Test the connection with timeout using getLatestBlockhash (more reliable than getHealth)
          await Promise.race([
            testConnection.getLatestBlockhash(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 8000))
          ]);
          connection = testConnection;
          rpcUrl = url;
          console.log(`✅ Connected to Solana RPC: ${url}`);
          break;
        } catch (error) {
          console.warn(`❌ Failed to connect to ${url}:`, error.message);
          failedRpcs.push(url);
          lastError = error;
          continue;
        }
      }
      
      if (!connection) {
        const errorMsg = `All ${rpcUrls.length} Solana RPC endpoints failed:\n` +
          `- Tried: ${failedRpcs.join(', ')}\n` +
          `- Last error: ${lastError?.message || 'Unknown error'}\n\n` +
          `Please check your internet connection or configure VITE_SOLANA_RPC_URL with a valid RPC endpoint.`;
        throw new Error(errorMsg);
      }
      
      // USDC mint address on Solana
      const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      
      // Get user's public key
      const userPublicKey = new PublicKey(address);
      const paymentPublicKey = new PublicKey(paymentAddress);
      
      // Get user's USDC token account address (associated token account)
      const userTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, userPublicKey);
      
      // Get payment wallet's USDC token account address
      const paymentTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, paymentPublicKey);
      
      if (import.meta.env.MODE !== 'production') {
        console.log('🔍 Checking token accounts...');
        console.log(`  User token account: ${userTokenAccount.toString()}`);
        console.log(`  Payment token account: ${paymentTokenAccount.toString()}`);
      }
      
      // Check if user has USDC token account
      let userTokenAccountExists = false;
      try {
        await getAccount(connection, userTokenAccount);
        userTokenAccountExists = true;
        console.log('✅ User has USDC token account');
      } catch (error) {
        console.error('❌ User USDC token account not found:', error.message);
        throw new Error('USDC token account not found. Please add USDC to your wallet first.');
      }
      
      // Check if payment token account exists, create instruction if needed
      let paymentTokenAccountExists = false;
      try {
        await getAccount(connection, paymentTokenAccount);
        paymentTokenAccountExists = true;
        console.log('✅ Payment token account exists');
      } catch (error) {
        console.log('ℹ️ Payment token account does not exist, will create it');
        paymentTokenAccountExists = false;
      }
      
      // Convert amount to USDC units (6 decimals)
      const amountInUSDC = BigInt(Math.floor(parseFloat(amount) * 1000000));
      if (import.meta.env.MODE !== 'production') {
        console.log(`💰 Transferring ${amount} USDC (${amountInUSDC} raw units)`);
      }
      
      // Create transaction
      const transaction = new Transaction();
      
      // Add instruction to create payment token account if it doesn't exist
      if (!paymentTokenAccountExists) {
        console.log('➕ Adding createAssociatedTokenAccount instruction');
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          userPublicKey,           // payer (user pays for account creation)
          paymentTokenAccount,     // associated token account address to create
          paymentPublicKey,        // owner of the token account
          USDC_MINT,               // USDC mint
          TOKEN_PROGRAM_ID,        // token program
          ASSOCIATED_TOKEN_PROGRAM_ID // associated token program
        );
        transaction.add(createATAInstruction);
        console.log('✅ Added createATA instruction (ATA will be created for recipient)');
      }
      
      // Create and add transfer instruction
      console.log('➕ Adding transfer instruction');
      const transferInstruction = createTransferInstruction(
        userTokenAccount,    // source
        paymentTokenAccount, // destination
        userPublicKey,       // owner (authority)
        amountInUSDC         // amount
      );
      transaction.add(transferInstruction);
      
      // Get recent blockhash and set transaction parameters
      if (import.meta.env.MODE !== 'production') {
        console.log('📡 Getting recent blockhash...');
      }
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPublicKey;
      
      if (import.meta.env.MODE !== 'production') {
        console.log('🔐 Signing transaction with wallet...');
        console.log(`📝 Transaction has ${transaction.instructions.length} instruction(s)`);
      }
      
      // Check if wallet is connected
      if (!window.solana.isConnected) {
        throw new Error('Wallet is not connected. Please connect your wallet first.');
      }
      
      // Check if public key matches
      const currentPublicKey = window.solana.publicKey;
      if (!currentPublicKey || currentPublicKey.toString() !== address) {
        console.warn('⚠️ Wallet public key mismatch, reconnecting...');
        await window.solana.connect();
        if (window.solana.publicKey.toString() !== address) {
          throw new Error('Wallet address mismatch. Please reconnect with the correct wallet.');
        }
      }
      
      // Sign and send transaction - Phantom returns signature as string
      let signature = null;
      try {
        const result = await window.solana.signAndSendTransaction(transaction, {
          skipPreflight: false,
          maxRetries: 3
        });
        
        if (import.meta.env.MODE !== 'production') {
          console.log('✅ Solana transaction result:', result);
          console.log('✅ Result type:', typeof result);
          console.log('✅ Result keys:', result ? Object.keys(result) : 'null');
        }
        
        // Phantom wallet typically returns signature as base58 string directly
        // But handle all possible formats
        if (typeof result === 'string') {
          signature = result;
        } else if (result && typeof result === 'object') {
          // Try signature property first (most common)
          if (result.signature) {
            if (typeof result.signature === 'string') {
              signature = result.signature;
            } else if (result.signature.toString) {
              signature = result.signature.toString();
            }
          }
          // Try pubkey property (some Phantom versions return signature in pubkey)
          if (!signature && result.pubkey) {
            if (typeof result.pubkey === 'string') {
              signature = result.pubkey;
            } else if (result.pubkey.toString && typeof result.pubkey.toString === 'function') {
              signature = result.pubkey.toString();
            }
          }
          // Try value property
          if (!signature && result.value) {
            if (typeof result.value === 'string') {
              signature = result.value;
            } else if (result.value.toString) {
              signature = result.value.toString();
            }
          }
          // Try txid property (some wallets use this)
          if (!signature && result.txid) {
            if (typeof result.txid === 'string') {
              signature = result.txid;
            } else if (result.txid.toString) {
              signature = result.txid.toString();
            }
          }
        }
        
        if (signature) {
          if (import.meta.env.MODE !== 'production') {
            console.log(`📋 Transaction signature extracted: ${signature}`);
          }
          return signature;
        } else {
          console.error('❌ Could not extract signature. Full result:', JSON.stringify(result, null, 2));
          throw new Error('Invalid transaction result: no signature found. Result: ' + JSON.stringify(result));
        }
      } catch (signError) {
        console.error('❌ Error signing/sending transaction:', signError);
        
        // Provide better error messages
        if (signError.code === 4001 || signError.code === -32603) {
          throw new Error('User rejected the transaction');
        } else if (signError.message && signError.message.includes('insufficient')) {
          throw new Error('Insufficient funds for transaction');
        } else if (signError.message && signError.message.includes('token account')) {
          throw new Error('USDC token account not found. Please add USDC to your wallet first.');
        } else {
          throw new Error(`Transaction failed: ${signError.message || signError.toString()}`);
        }
      }
      
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
      
    }
  }, [isOpen]);


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
        { chainId: 42161, name: 'Arbitrum', usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' }, // Native USDC
        { chainId: 10, name: 'Optimism', usdcAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' }, // Native USDC
        { chainId: 8453, name: 'Base', usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } // Native USDC
      ];

      const usdcABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];

      const balances = {};
      let currentNetworkBalance = 0;
      let networksWithUSDC = [];

      // Check current network first
      const currentNetworkInfo = await getCurrentNetwork();
      const currentChainId = currentNetworkInfo?.chainId || null;
      
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
    if (!chainId) {
      return 'https://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY';
    }
    
    const rpcUrls = {
      1: import.meta.env.VITE_ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY',
      137: import.meta.env.VITE_POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY',
      42161: import.meta.env.VITE_ARBITRUM_RPC_URL || 'https://arb-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY',
      10: import.meta.env.VITE_OPTIMISM_RPC_URL || 'https://opt-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY',
      8453: import.meta.env.VITE_BASE_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY'
    };
    return rpcUrls[chainId] || 'https://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY';
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
        rpcUrls: [import.meta.env.VITE_ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY'],
        blockExplorerUrls: ['https://etherscan.io']
      },
      8453: {
        chainId: '0x2105',
        chainName: 'Base',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: [import.meta.env.VITE_BASE_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY'],
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


  const handleSendTransaction = async () => {
    console.log('🚀 handleSendTransaction called', { 
      amount, 
      walletType, 
      address,
      isConnected: !!address 
    });
    
    if (!amount) {
      console.log('❌ Missing amount');
      setError('Please enter an amount');
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
          const { Connection } = await import('@solana/web3.js');
          
          // Use same RPC fallback logic as buildSolanaUSDCTransaction
          const envRpcUrl = import.meta.env.VITE_SOLANA_RPC_URL;
          const rpcUrls = [
            ...(envRpcUrl && envRpcUrl.trim() ? [envRpcUrl.trim()] : []),
            'https://api.mainnet-beta.solana.com',
            'https://solana-api.projectserum.com',
            'https://rpc.ankr.com/solana',
            'https://solana-mainnet.g.alchemy.com/v2/demo',
            'https://mainnet.helius-rpc.com'
          ].filter(url => url && typeof url === 'string' && url.length > 0);
          
          let connection = null;
          let lastError = null;
          
          for (const url of rpcUrls) {
            try {
              const testConnection = new Connection(url, { commitment: 'confirmed' });
              await Promise.race([
                testConnection.getLatestBlockhash(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
              ]);
              connection = testConnection;
              console.log(`✅ Using RPC for confirmation: ${url}`);
              break;
            } catch (error) {
              lastError = error;
              continue;
            }
          }
          
          if (!connection) {
            throw new Error(`Failed to connect to any Solana RPC endpoint. Last error: ${lastError?.message}`);
          }
          
          // Build and send Solana USDC transaction
          // Reconcile frontend vs backend payment address for safety
          let solanaPaymentAddress = getPaymentWallet('solana', 'solana');
          try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
            const resp = await fetch(`${apiUrl}/api/payment/get-address`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ walletAddress: address })
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data?.solanaPaymentAddress && data.solanaPaymentAddress !== solanaPaymentAddress) {
                if (import.meta.env.MODE !== 'production') {
                  console.warn('[Payment] Frontend Solana address differs from backend. Using backend value.');
                }
                solanaPaymentAddress = data.solanaPaymentAddress;
              }
            }
          } catch (_) {
            // Non-fatal; continue with local value
          }
          const txSignature = await buildSolanaUSDCTransaction(amount, solanaPaymentAddress);
          
          console.log('✅ Solana transaction signed! Signature:', txSignature);
          setError(`⏳ Transaction submitted! Signature: ${txSignature}\n\nWaiting for confirmation...`);
          
          // Wait for confirmation
          console.log('⏳ Waiting for Solana transaction confirmation...');
          let confirmed = false;
          let attempts = 0;
          const maxAttempts = 20; // Wait up to 20 seconds
          
          while (!confirmed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            attempts++;
            
            const status = await connection.getSignatureStatus(txSignature);
            if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
              if (status.value.err) {
                throw new Error('Transaction failed on blockchain');
              }
              confirmed = true;
              console.log('✅ Solana transaction confirmed on blockchain!');
              break;
            }
          }
          
          if (!confirmed) {
            throw new Error('Transaction confirmation timeout');
          }
          
          // Credit after confirmation
          try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
            console.log('💰 Crediting confirmed Solana transaction...');
            
            const creditResponse = await fetch(`${apiUrl}/api/payments/credit`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                txHash: txSignature,
                walletAddress: address,
                tokenSymbol: 'USDC',
                amount: parseFloat(amount),
                chainId: 'solana',
                walletType: 'solana'
              })
            });
            
            const creditData = await creditResponse.json();
            
            if (creditData.success) {
              console.log('✅ Credits added!', creditData);
              setError(`✅ Payment confirmed! ${creditData.credits} credits added. New balance: ${creditData.totalCredits} credits.`);
              setPaymentStatus('confirmed');
              
              // Optimistically update credits immediately
              const newTotal = (typeof creditData.totalCredits !== 'undefined')
                ? Number(creditData.totalCredits)
                : Number(credits || 0) + Number(creditData.credits || 0);
              if (!Number.isNaN(newTotal)) {
                setCreditsManually(newTotal);
              }

              // Refresh user credits immediately (skip cache to get fresh data)
              fetchCredits(address, 3, true).catch(() => {});
              
              setTimeout(() => {
                onClose();
              }, 2000);
            } else {
              throw new Error(creditData.error || 'Failed to credit');
            }
          } catch (creditError) {
            console.error('Error crediting:', creditError);
            setError(`Transaction confirmed but crediting failed: ${creditError.message}`);
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
          } else if (solanaError.message.includes('RPC') || solanaError.message.includes('endpoints')) {
            errorMessage += `RPC connection issue: ${solanaError.message}`;
          } else {
            errorMessage += `Error: ${solanaError.message}`;
          }
          
          setError(errorMessage);
        }
      } else {
        console.log('🔍 Processing USDC payment...');
        
        try {
          // Get current network info
          const networkInfo = await getCurrentNetwork();
          const chainId = networkInfo?.chainId;
          const network = networkInfo?.network;
          
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
            42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum - Native USDC
            10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism - Native USDC
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
          
          // Use chainId from above (already fetched)
          const paymentAddress = getPaymentWallet(chainId, 'evm');
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
          
          console.log('✅ Transaction signed! Hash:', tx.hash);
          setError(`⏳ Transaction submitted! Hash: ${tx.hash}\n\nWaiting for confirmation...`);
          
          // Wait for transaction confirmation
          console.log('⏳ Waiting for transaction confirmation...');
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            console.log('✅ Transaction confirmed on blockchain!');
            
            // Credit after confirmation (transaction is guaranteed to be on-chain)
            try {
              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
              console.log('💰 Crediting confirmed transaction...');
              
              const creditResponse = await fetch(`${apiUrl}/api/payments/credit`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  txHash: tx.hash,
                  walletAddress: address,
                  tokenSymbol: 'USDC',
                  amount: parseFloat(amount),
                  chainId: chainId,
                  walletType: 'evm'
                })
              });
              
              const creditData = await creditResponse.json();
              
              if (creditData.success) {
                console.log('✅ Credits added!', creditData);
                setError(`✅ Payment confirmed! ${creditData.credits} credits added. New balance: ${creditData.totalCredits} credits.`);
                setPaymentStatus('confirmed');
                
                // Optimistically update credits immediately
                const newTotal = (typeof creditData.totalCredits !== 'undefined')
                  ? Number(creditData.totalCredits)
                  : Number(credits || 0) + Number(creditData.credits || 0);
                if (!Number.isNaN(newTotal)) {
                  setCreditsManually(newTotal);
                }

                // Refresh user credits in background to reconcile
                fetchCredits(address, 3, true).catch(() => {});
                
                setTimeout(() => {
                  onClose();
                }, 2000);
              } else {
                throw new Error(creditData.error || 'Failed to credit');
              }
            } catch (creditError) {
              console.error('Error crediting:', creditError);
              setError(`Transaction confirmed but crediting failed: ${creditError.message}`);
            }
          } else {
            throw new Error('Transaction failed on blockchain');
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
    const networkInfo3 = await getCurrentNetwork();
    const chainId = networkInfo3?.chainId || null;
    
    // Check once for any USDC transfer to payment wallet
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      console.log('[Payment] Checking for USDC transfer to payment wallet');
      
      // Use instant-check endpoint to detect ANY USDC transfer
      const response = await fetch(`${apiUrl}/api/payment/instant-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
          expectedAmount: numAmount,
          token: 'USDC',
          chainId: chainId
        })
      });
      
      const data = await response.json();
      console.log('[Payment] Check result:', data);
      
      if (data.success && data.paymentDetected) {
        console.log('[Payment] Payment detected!', data.payment);
        setPaymentStatus('confirmed');
        setCheckingPayment(false);
        
        // Optimistically update credits immediately
        const optimisticTotal = (typeof data.newBalance !== 'undefined')
          ? Number(data.newBalance)
          : Number(credits || 0) + Number(data.credits || 0);
        if (!Number.isNaN(optimisticTotal)) {
          setCreditsManually(optimisticTotal);
        }

        // Refresh credits immediately (skip cache to get fresh data)
        fetchCredits(address, 3, true).catch(() => {});
        
        const senderInfo = data.senderAddress ? `Sender: ${data.senderAddress}` : '';
        setError(`✅ Payment confirmed! ${data.credits} credits added. New balance: ${data.newBalance} credits. ${senderInfo}`);
        
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setCheckingPayment(false);
        setPaymentStatus('');
        setError('No USDC transfer detected to the payment wallet. Please send the transaction first.');
      }
    } catch (error) {
      console.error('[Payment] Error checking payment:', error);
      setCheckingPayment(false);
      setError('Error checking payment: ' + error.message);
    }
  };

  const handlePayment = async () => {
    // This now sends USDC and automatically checks for it
    await handleSendTransaction();
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
    
    // Standard pricing: $0.15 per generation (6.67 credits per USDC)
    const creditsPerUSDC = 6.67;
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
                1 USDC = 6.67 Credits
              </span>
            </div>
          </div>

          {/* Clear Instructions */}
          <div className="p-2 rounded border border-white/10 bg-black/20">
            <div className="text-xs text-white font-semibold mb-2">📋 How to Pay:</div>
            <div className="text-xs text-gray-300 space-y-1">
              <p><strong>1.</strong> Enter amount and click "Send USDC" below</p>
              <p><strong>2.</strong> Confirm the transaction in your wallet</p>
              <p><strong>3.</strong> Credits added automatically after confirmation!</p>
              <p className="text-green-300"><strong>⚡ Automatic:</strong> No manual checking needed</p>
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
                  disabled={!amount || parseFloat(amount) < 1 || isProcessing}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Coins className="w-4 h-4" />
                  <span>{isProcessing ? 'Sending USDC...' : 'Send USDC'}</span>
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
