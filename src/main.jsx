import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Initialize Sentry for error monitoring
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE || 'development',
  integrations: [
    new Sentry.BrowserTracing(),
  ],
  tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
  beforeSend(event) {
    // Filter out non-critical errors in production
    if (import.meta.env.MODE === 'production') {
      const errorMessage = event.exception?.values?.[0]?.value || '';
      const errorStack = event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename || '';
      
      // Don't send wallet connection errors to Sentry
      if (errorMessage.includes('User rejected') || 
          errorMessage.includes('code: 4001') ||
          errorMessage.includes('Connection cancelled by user')) {
        return null;
      }
      
      // Don't send ethereum property redefinition errors
      if (errorMessage.includes('Cannot redefine property: ethereum') ||
          errorMessage.includes('originalDefineProperty') ||
          errorStack.includes('evmAsk.js') ||
          errorStack.includes('content-script.js')) {
        return null;
      }
      
      // Don't send wallet injection conflicts
      if (errorMessage.includes('Wallet injection conflict') ||
          errorMessage.includes('Wallet conflict detected')) {
        return null;
      }
    }
    return event;
  },
});

// Validate required environment variables
import { logger } from './utils/logger.js';

const requiredEnvVars = ['VITE_FAL_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !import.meta.env[varName]);

if (missingVars.length > 0) {
  logger.warn('Missing required environment variables', { missingVars });
  logger.warn('Please check your .env file and ensure all required variables are set.');
  logger.warn('The app will continue to run but some features may not work correctly.');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={({ error, resetError }) => (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
          <p className="text-gray-400 mb-6">
            We're sorry, but something unexpected happened. Our team has been notified.
          </p>
          <div className="space-y-3">
            <button
              onClick={resetError}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Reload Page
            </button>
          </div>
          {import.meta.env.MODE === 'development' && (
            <details className="mt-6 text-left">
              <summary className="text-gray-400 cursor-pointer">Error Details</summary>
              <pre className="mt-2 text-xs text-red-400 bg-gray-800 p-3 rounded overflow-auto">
                {error?.toString()}
              </pre>
            </details>
          )}
        </div>
      </div>
    )}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)