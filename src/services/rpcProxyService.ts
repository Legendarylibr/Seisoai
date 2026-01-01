/**
 * RPC Proxy Service - routes blockchain RPC calls through the backend
 * This avoids CORS issues and works even when frontend env vars aren't set
 */

import { API_URL } from '../utils/apiConfig';

// Types
interface RpcResponse<T = unknown> {
  success: boolean;
  result?: {
    jsonrpc: string;
    result?: T;
    error?: { message: string };
    id: number;
  };
  error?: string;
}

interface BlockhashResult {
  blockhash: string;
  lastValidBlockHeight: number;
}

interface TokenBalanceResult {
  amount: string;
  decimals: number;
  uiAmount: number;
  uiAmountString: string;
}

/**
 * Make a Solana RPC call through the backend proxy
 */
export async function solanaRpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
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
    
    const data = await response.json() as RpcResponse<T>;
    
    if (!data.success) {
      throw new Error(data.error || 'Solana RPC call failed');
    }
    
    // Backend returns: { success: true, result: { jsonrpc: "2.0", result: {...}, id: 1 } }
    // Extract the actual RPC result
    const rpcResponse = data.result;
    
    if (rpcResponse?.error) {
      throw new Error(rpcResponse.error.message || 'Solana RPC error');
    }
    
    return rpcResponse?.result as T;
  } catch (error) {
    const err = error as Error;
    // Re-throw with more context
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error(`Backend proxy unavailable. Make sure backend is running on ${API_URL || 'http://localhost:3001'}`);
    }
    throw error;
  }
}

/**
 * Make an EVM RPC call through the backend proxy
 */
export async function evmRpc<T = unknown>(chainId: number, method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(`${API_URL}/api/evm/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId, method, params })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json() as RpcResponse<T>;
  
  if (!data.success) {
    throw new Error(data.error || 'EVM RPC call failed');
  }
  
  // Backend returns: { success: true, result: { jsonrpc: "2.0", result: {...}, id: 1 } }
  // Extract the actual RPC result
  const rpcResponse = data.result;
  
  if (rpcResponse?.error) {
    throw new Error(rpcResponse.error.message || 'EVM RPC error');
  }
  
  return rpcResponse?.result as T;
}

/**
 * Get the latest Solana blockhash via proxy
 */
export async function getLatestBlockhash(): Promise<BlockhashResult> {
  interface BlockhashResponse {
    value?: BlockhashResult;
    blockhash?: string;
    lastValidBlockHeight?: number;
  }
  
  const result = await solanaRpc<BlockhashResponse>('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  // Result structure: { context: {...}, value: { blockhash: "...", lastValidBlockHeight: ... } }
  if (result?.value) {
    return result.value;
  }
  // Fallback if structure is different
  return result as unknown as BlockhashResult;
}

/**
 * Get Solana signature status via proxy
 */
export async function getSignatureStatus(signature: string): Promise<unknown> {
  interface SignatureStatusResponse {
    value?: unknown[];
  }
  
  const result = await solanaRpc<SignatureStatusResponse>('getSignatureStatuses', [[signature]]);
  return result?.value?.[0];
}

/**
 * Get Solana account info via proxy
 */
export async function getAccountInfo(
  address: string, 
  config: { encoding?: string; commitment?: string } = { encoding: 'base64', commitment: 'confirmed' }
): Promise<unknown> {
  interface AccountInfoResponse {
    value?: unknown;
  }
  
  const result = await solanaRpc<AccountInfoResponse>('getAccountInfo', [address, config]);
  return result?.value;
}

/**
 * Get token account balance via proxy
 */
export async function getTokenAccountBalance(tokenAccountAddress: string): Promise<TokenBalanceResult | undefined> {
  interface TokenBalanceResponse {
    value?: TokenBalanceResult;
  }
  
  const result = await solanaRpc<TokenBalanceResponse>('getTokenAccountBalance', [tokenAccountAddress, { commitment: 'confirmed' }]);
  return result?.value;
}

/**
 * Check USDC balance on an EVM chain via proxy
 */
export async function getUsdcBalance(chainId: number, walletAddress: string, usdcAddress: string): Promise<string> {
  // balanceOf(address) selector + padded address
  const selector = '0x70a08231';
  const paddedAddress = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = selector + paddedAddress;
  
  const result = await evmRpc<string>(chainId, 'eth_call', [
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
  getAccountInfo,
  getTokenAccountBalance,
  getUsdcBalance
};

