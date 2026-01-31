/**
 * EmailAuthContext - Stub for wallet-only mode
 * 
 * Email authentication has been removed. This file remains to provide
 * a compatible interface for components that still import useEmailAuth.
 * All functions return disabled/no-op values.
 */

interface EmailAuthContextValue {
  isAuthenticated: boolean;
  email: string | null;
  userId: string | null;
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  isLoading: boolean;
  error: string | null;
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  fetchUserData: (force?: boolean) => Promise<void>;
  setCreditsManually: (credits: number) => void;
}

// Default value - email auth is disabled, wallet-only mode
const defaultEmailAuthValue: EmailAuthContextValue = {
  isAuthenticated: false,
  email: null,
  userId: null,
  credits: 0,
  totalCreditsEarned: 0,
  totalCreditsSpent: 0,
  isLoading: false,
  error: null,
  signUp: async () => ({ success: false, error: 'Email auth disabled - use wallet' }),
  signIn: async () => ({ success: false, error: 'Email auth disabled - use wallet' }),
  signOut: async () => {},
  refreshCredits: async () => {},
  fetchUserData: async () => {},
  setCreditsManually: () => {}
};

/**
 * Hook for email auth - returns disabled defaults in wallet-only mode
 * Kept for backwards compatibility with existing component imports
 */
export const useEmailAuth = (): EmailAuthContextValue => {
  return defaultEmailAuthValue;
};

// Export provider as no-op for any legacy code
export const EmailAuthProvider = ({ children }: { children: React.ReactNode }) => children;
