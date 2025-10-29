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
import logger from './utils/logger.js';

const requiredEnvVars = ['VITE_FAL_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !import.meta.env[varName]);

if (missingVars.length > 0) {
  console.warn('⚠️ Missing required environment variables:', missingVars);
  console.warn('⚠️ Please check your .env file and ensure all required variables are set.');
  console.warn('⚠️ The app will continue to run but some features may not work correctly.');
  
  // Show user-friendly error in the UI
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #ff6b6b;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    max-width: 500px;
    text-align: center;
  `;
  errorDiv.innerHTML = `
    <strong>⚠️ Configuration Required</strong><br>
    Missing FAL API key. Please add VITE_FAL_API_KEY to your .env file.<br>
    <small>Get your API key from <a href="https://fal.ai" target="_blank" style="color: #fff; text-decoration: underline;">fal.ai</a></small>
  `;
  document.body.appendChild(errorDiv);
  
  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 10000);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)