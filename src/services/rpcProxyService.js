/**
 * RPC Proxy Service - routes blockchain RPC calls through the backend
 * This avoids CORS issues and works even when frontend env vars aren't set
 */

import { API_URL } from '../utils/apiConfig.js';

/**
 * Make a Solana RPC call through the backend proxy
 * @param {string} method - The Solana RPC method name
 * @param {Array} params - The parameters for the RPC call
 * @returns {Promise<any>} The RPC result
 */
export async function solanaRpc(method, params = []) {
  try {
    const response = await fetch(`${API_URL}/api/solana/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Solana RPC call failed');
    }
    
    // Backend returns: { success: true, result: { jsonrpc: "2.0", result: {...}, id: 1 } }
    // Extract the actual RPC result
    const rpcResponse = data.result;
    
    if (rpcResponse?.error) {
      throw new Error(rpcResponse.error.message || 'Solana RPC error');
    }
    
    return rpcResponse?.result;
  } catch (error) {
    // Re-throw with more context
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error(`Backend proxy unavailable. Make sure backend is running on ${API_URL || 'http://localhost:3001'}`);
    }
    throw error;
  }
}

/**
 * Make an EVM RPC call through the backend proxy
 * @param {number} chainId - The EVM chain ID
 * @param {string} method - The RPC method name (e.g., 'eth_call')
 * @param {Array} params - The parameters for the RPC call
 * @returns {Promise<any>} The RPC result
 */
export async function evmRpc(chainId, method, params = []) {
  const response = await fetch(`${API_URL}/api/evm/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId, method, params })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'EVM RPC call failed');
  }
  
  // Backend returns: { success: true, result: { jsonrpc: "2.0", result: {...}, id: 1 } }
  // Extract the actual RPC result
  const rpcResponse = data.result;
  
  if (rpcResponse?.error) {
    throw new Error(rpcResponse.error.message || 'EVM RPC error');
  }
  
  return rpcResponse?.result;
}

/**
 * Get the latest Solana blockhash via proxy
 * @returns {Promise<{blockhash: string, lastValidBlockHeight: number}>}
 */
export async function getLatestBlockhash() {
  const result = await solanaRpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  // Result structure: { context: {...}, value: { blockhash: "...", lastValidBlockHeight: ... } }
  if (result?.value) {
    return result.value;
  }
  // Fallback if structure is different
  return result;
}

/**
 * Get Solana signature status via proxy
 * @param {string} signature - The transaction signature
 * @returns {Promise<any>}
 */
export async function getSignatureStatus(signature) {
  const result = await solanaRpc('getSignatureStatuses', [[signature]]);
  return result?.value?.[0];
}

/**
 * Check USDC balance on an EVM chain via proxy
 * @param {number} chainId - The chain ID
 * @param {string} walletAddress - The wallet address
 * @param {string} usdcAddress - The USDC contract address
 * @returns {Promise<string>} The balance in USDC
 */
export async function getUsdcBalance(chainId, walletAddress, usdcAddress) {
  // balanceOf(address) selector + padded address
  const selector = '0x70a08231';
  const paddedAddress = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = selector + paddedAddress;
  
  const result = await evmRpc(chainId, 'eth_call', [
    { to: usdcAddress, data },
    'latest'
  ]);
  
  // Convert hex result to decimal and divide by 10^6 (USDC decimals)
  const balanceWei = BigInt(result || '0x0');
  return (Number(balanceWei) / 1e6).toFixed(2);
}

export default {
  solanaRpc,
  evmRpc,
  getLatestBlockhash,
  getSignatureStatus,
  getUsdcBalance
};

