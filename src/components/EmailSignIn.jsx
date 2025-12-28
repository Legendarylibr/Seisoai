import React, { useState, useRef, useCallback } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Wifi, WifiOff } from 'lucide-react';

const EmailSignIn = () => {
  const { signIn, signUp, isLoading, error: authError } = useEmailAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState(''); // 'validation', 'network', 'server'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitTimeoutRef = useRef(null);
  const lastSubmitRef = useRef(0);

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Password requirements validation (matches backend)
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
  
  const validateEmail = (emailStr) => {
    const trimmed = emailStr.trim();
    if (!trimmed) return { valid: false, message: 'Email is required' };
    if (!emailRegex.test(trimmed)) return { valid: false, message: 'Please enter a valid email address' };
    if (trimmed.length > 254) return { valid: false, message: 'Email address is too long' };
    return { valid: true };
  };

  const validatePassword = (pwd) => {
    return passwordRegex.test(pwd);
  };

  const getPasswordRequirements = () => {
    if (!password) return [];
    const requirements = [];
    if (password.length < 12) {
      requirements.push('At least 12 characters');
    }
    if (!/[a-z]/.test(password)) {
      requirements.push('One lowercase letter');
    }
    if (!/[A-Z]/.test(password)) {
      requirements.push('One uppercase letter');
    }
    if (!/\d/.test(password)) {
      requirements.push('One number');
    }
    if (!/[@$!%*?&]/.test(password)) {
      requirements.push('One special character (@$!%*?&)');
    }
    return requirements;
  };

  // Debounced submit to prevent double-clicks
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    // Prevent rapid re-submission (debounce 1 second)
    const now = Date.now();
    if (now - lastSubmitRef.current < 1000) {
      return;
    }
    lastSubmitRef.current = now;

    // Clear previous errors
    setError('');
    setErrorType('');

    // Trim email
    const trimmedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailValidation = validateEmail(trimmedEmail);
    if (!emailValidation.valid) {
      setError(emailValidation.message);
      setErrorType('validation');
      return;
    }

    // Validate password is provided
    if (!password) {
      setError('Password is required');
      setErrorType('validation');
      return;
    }

    // Signup-specific validations
    if (isSignUp) {
      // Validate password requirements
      if (!validatePassword(password)) {
        const requirements = getPasswordRequirements();
        setError(`Password requirements not met: ${requirements.join(', ')}`);
        setErrorType('validation');
        return;
      }

      // Validate confirm password
      if (!confirmPassword) {
        setError('Please confirm your password');
        setErrorType('validation');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setErrorType('validation');
        return;
      }
    }

    // Prevent concurrent submissions
    if (isSubmitting) return;
    setIsSubmitting(true);

    // Set a timeout for the request (30 seconds)
    const timeoutId = setTimeout(() => {
      setIsSubmitting(false);
      setError('Request timed out. Please check your connection and try again.');
      setErrorType('network');
    }, 30000);
    submitTimeoutRef.current = timeoutId;

    try {
      if (isSignUp) {
        await signUp(trimmedEmail, password);
      } else {
        await signIn(trimmedEmail, password);
      }
      // Clear timeout on success
      clearTimeout(timeoutId);
    } catch (err) {
      clearTimeout(timeoutId);
      
      // Categorize the error
      const errorMessage = err.message || 'Authentication failed';
      
      if (errorMessage.includes('fetch') || 
          errorMessage.includes('network') || 
          errorMessage.includes('Network') ||
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('ECONNREFUSED')) {
        setError('Unable to connect. Please check your internet connection and try again.');
        setErrorType('network');
      } else if (errorMessage.includes('already exists') || 
                 errorMessage.includes('already registered')) {
        setError('An account with this email already exists. Please sign in instead.');
        setErrorType('validation');
      } else if (errorMessage.includes('Invalid') || 
                 errorMessage.includes('incorrect') ||
                 errorMessage.includes('not found')) {
        setError('Invalid email or password. Please try again.');
        setErrorType('validation');
      } else if (errorMessage.includes('rate limit') || 
                 errorMessage.includes('too many')) {
        setError('Too many attempts. Please wait a moment and try again.');
        setErrorType('server');
      } else {
        setError(errorMessage);
        setErrorType('server');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, confirmPassword, isSignUp, isSubmitting, signIn, signUp]);

  const displayError = error || authError;

  return (
    <div className="w-full max-w-md md:max-w-xl mx-auto">
      <div className="glass-card rounded-xl p-6 md:p-8 space-y-6 md:space-y-8 relative overflow-hidden">
        {/* Shimmer overlay */}
        <div className="absolute inset-0 -translate-x-full hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none"></div>
        
        {/* Header */}
        <div className="text-center relative z-10">
          <div 
            className="w-16 h-16 md:w-20 md:h-20 rounded-xl flex items-center justify-center mx-auto mb-4 md:mb-6 transition-transform duration-300 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #f0f0f8, #e0e0e8, #d0d0d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.15)'
            }}
          >
            <Mail className="w-8 h-8 md:w-10 md:h-10" style={{ color: '#000000', filter: 'drop-shadow(0 0 4px rgba(0, 212, 255, 0.3))' }} />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-2 md:mb-3 tracking-wide" style={{ 
            color: '#000000', 
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.9)',
            fontFamily: "'VT323', monospace",
            letterSpacing: '0.05em'
          }}>
            {isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
          </h2>
          <p className="text-sm md:text-base" style={{ 
            color: '#1a1a2e', 
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>
            {isSignUp ? 'Sign up with email to get started' : 'Sign in with your email'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          {/* Email Input */}
          <div>
            <label className="block text-sm md:text-base font-medium mb-2 md:mb-3" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 md:left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 md:w-6 md:h-6" style={{ color: '#000000' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full pl-10 md:pl-12 pr-4 md:pr-5 py-3 md:py-4 rounded text-sm md:text-base"
                style={{
                  background: 'linear-gradient(to bottom, #ffffff, #f8f8f8)',
                  border: '2px inset #c0c0c0',
                  boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)',
                  color: '#000000',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}
                required
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm md:text-base font-medium mb-2 md:mb-3" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 md:left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 md:w-6 md:h-6" style={{ color: '#000000' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 md:pl-12 pr-12 md:pr-14 py-3 md:py-4 rounded text-sm md:text-base"
                style={{
                  background: 'linear-gradient(to bottom, #ffffff, #f8f8f8)',
                  border: '2px inset #c0c0c0',
                  boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)',
                  color: '#000000',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}
                required
                minLength={isSignUp ? 12 : 6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 md:right-4 top-1/2 transform -translate-y-1/2 transition-colors"
                style={{ color: '#000000' }}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5 md:w-6 md:h-6" />
                ) : (
                  <Eye className="w-5 h-5 md:w-6 md:h-6" />
                )}
              </button>
            </div>
            {/* Password Requirements (only shown on signup) */}
            {isSignUp && (
              <div className="mt-2 md:mt-3 p-3 md:p-4 rounded text-xs md:text-sm" style={{
                background: 'linear-gradient(to bottom, #ffffdd, #ffffbb, #ffffaa)',
                border: '2px outset #ffffbb',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.8), inset -2px -2px 0 rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15)',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
              }}>
                <div className="font-semibold mb-1 md:mb-2" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                  Password Requirements:
                </div>
                <ul className="list-disc list-inside space-y-0.5 md:space-y-1 text-[10px] md:text-xs">
                  <li className={password.length >= 12 ? 'line-through opacity-60' : ''}>At least 12 characters</li>
                  <li className={/[a-z]/.test(password) ? 'line-through opacity-60' : ''}>One lowercase letter</li>
                  <li className={/[A-Z]/.test(password) ? 'line-through opacity-60' : ''}>One uppercase letter</li>
                  <li className={/\d/.test(password) ? 'line-through opacity-60' : ''}>One number</li>
                  <li className={/[@$!%*?&]/.test(password) ? 'line-through opacity-60' : ''}>One special character (@$!%*?&)</li>
                </ul>
              </div>
            )}
          </div>

          {/* Confirm Password Input (only on signup) */}
          {isSignUp && (
            <div>
              <label className="block text-sm md:text-base font-medium mb-2 md:mb-3" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 md:left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 md:w-6 md:h-6" style={{ color: '#000000' }} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 md:pl-12 pr-12 md:pr-14 py-3 md:py-4 rounded text-sm md:text-base"
                  style={{
                    background: 'linear-gradient(to bottom, #ffffff, #f8f8f8)',
                    border: confirmPassword && password !== confirmPassword 
                      ? '2px solid #ff6b6b' 
                      : confirmPassword && password === confirmPassword 
                        ? '2px solid #51cf66'
                        : '2px inset #c0c0c0',
                    boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)',
                    color: '#000000',
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                  }}
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 md:right-4 top-1/2 transform -translate-y-1/2 transition-colors"
                  style={{ color: '#000000' }}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5 md:w-6 md:h-6" />
                  ) : (
                    <Eye className="w-5 h-5 md:w-6 md:h-6" />
                  )}
                </button>
              </div>
              {/* Password match indicator */}
              {confirmPassword && (
                <div className="mt-1 text-xs md:text-sm" style={{ 
                  color: password === confirmPassword ? '#2f9e44' : '#e03131',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}>
                  {password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {displayError && (
            <div 
              className="p-3 md:p-4 rounded text-sm md:text-base flex items-start gap-3"
              style={{
                background: errorType === 'network' 
                  ? 'linear-gradient(to bottom, #fff3e0, #ffe0c0)'
                  : 'linear-gradient(to bottom, #ffe0e0, #ffd0d0)',
                border: errorType === 'network'
                  ? '2px outset #ffd090'
                  : '2px outset #ffc0c0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              <div className="flex-shrink-0 mt-0.5">
                {errorType === 'network' ? (
                  <WifiOff className="w-5 h-5" style={{ color: '#e65100' }} />
                ) : (
                  <AlertCircle className="w-5 h-5" style={{ color: '#c62828' }} />
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium">{displayError}</div>
                {errorType === 'network' && (
                  <div className="text-xs mt-1 opacity-80">
                    Check your internet connection and try again
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || isSubmitting}
            className="w-full btn-primary py-3 md:py-4 flex items-center justify-center gap-2 text-sm md:text-base disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {(isLoading || isSubmitting) ? (
              <>
                <div 
                  className="w-5 h-5 md:w-6 md:h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: '#000000', borderTopColor: 'transparent' }}
                ></div>
                <span>{isSignUp ? 'Creating Account...' : 'Signing In...'}</span>
              </>
            ) : (
              <>
                <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />
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
              setErrorType('');
              setPassword(''); // Clear password when switching modes
              setConfirmPassword(''); // Clear confirm password
              setShowPassword(false);
              setShowConfirmPassword(false);
            }}
            className="text-sm md:text-base transition-colors"
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

