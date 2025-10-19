import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Initialize Sentry for error monitoring (disabled in development)
// import * as Sentry from '@sentry/react';

// Sentry.init({
//   dsn: import.meta.env.VITE_SENTRY_DSN || 'https://your_sentry_dsn_here@sentry.io/project',
//   environment: import.meta.env.MODE || 'development',
//   integrations: [
//     new Sentry.BrowserTracing(),
//   ],
//   tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
//   beforeSend(event) {
//     // Filter out non-critical errors in production
//     if (import.meta.env.MODE === 'production') {
//       const errorMessage = event.exception?.values?.[0]?.value || '';
//       const errorStack = event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename || '';
//       
//       // Don't send wallet connection errors to Sentry
//       if (errorMessage.includes('User rejected') || 
//           errorMessage.includes('code: 4001') ||
//           errorMessage.includes('Connection cancelled by user')) {
//         return null;
//       }
//       
//       // Don't send ethereum property redefinition errors
//       if (errorMessage.includes('Cannot redefine property: ethereum') ||
//           errorMessage.includes('originalDefineProperty') ||
//           errorStack.includes('evmAsk.js') ||
//           errorStack.includes('content-script.js')) {
//         return null;
//       }
//       
//       // Don't send wallet injection conflicts
//       if (errorMessage.includes('Wallet injection conflict') ||
//           errorMessage.includes('Wallet conflict detected')) {
//         return null;
//       }
//     }
//     return event;
//   },
// });

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
    <App />
  </React.StrictMode>
)