import React, { useState } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Wallet } from 'lucide-react';

const EmailSignIn = ({ onSwitchToWallet }) => {
  const { signIn, signUp, isLoading, error: authError } = useEmailAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    }
  };

  const displayError = error || authError;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="glass-card rounded-xl p-6 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}
          >
            <Mail className="w-8 h-8" style={{ color: '#000000' }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
            {isSignUp ? 'Create Account' : 'Sign In'}
          </h2>
          <p className="text-sm" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
            {isSignUp ? 'Sign up with email to get started' : 'Sign in with your email'}
          </p>
        </div>

        {/* Quick Switch to Wallet - Prominent Option */}
        {onSwitchToWallet && (
          <>
            <button
              onClick={onSwitchToWallet}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded transition-all duration-200"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                e.currentTarget.style.border = '2px outset #f8f8f8';
                e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 3px 6px rgba(0, 0, 0, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                e.currentTarget.style.border = '2px outset #f0f0f0';
                e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.border = '2px inset #c0c0c0';
                e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.border = '2px outset #f0f0f0';
                e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
              }}
            >
              <Wallet className="w-5 h-5" style={{ color: '#000000' }} />
              <span className="font-semibold">Connect with Wallet Instead</span>
            </button>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: '#808080' }}></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4" style={{ background: '#f8f8f8', color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>OR</span>
              </div>
            </div>
          </>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#000000' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full pl-10 pr-4 py-3 rounded"
                style={{
                  background: 'linear-gradient(to bottom, #ffffff, #f8f8f8)',
                  border: '2px inset #c0c0c0',
                  boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)',
                  color: '#000000',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#000000' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-12 py-3 rounded"
                style={{
                  background: 'linear-gradient(to bottom, #ffffff, #f8f8f8)',
                  border: '2px inset #c0c0c0',
                  boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)',
                  color: '#000000',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 transition-colors"
                style={{ color: '#000000' }}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {displayError && (
            <div 
              className="p-3 rounded text-sm"
              style={{
                background: 'linear-gradient(to bottom, #ffe0e0, #ffd0d0)',
                border: '2px outset #ffc0c0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              {displayError}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div 
                  className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: '#000000', borderTopColor: 'transparent' }}
                ></div>
                <span>{isSignUp ? 'Creating Account...' : 'Signing In...'}</span>
              </>
            ) : (
              <>
                <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Toggle Sign Up / Sign In */}
        <div className="text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-sm transition-colors"
            style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.textDecoration = 'underline';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = 'none';
            }}
          >
            {isSignUp ? (
              <>Already have an account? <span className="font-semibold underline">Sign In</span></>
            ) : (
              <>Don't have an account? <span className="font-semibold underline">Sign Up</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailSignIn;

