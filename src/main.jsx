import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Buffer polyfill for Solana
import { Buffer } from 'buffer'
window.Buffer = Buffer
global.Buffer = Buffer

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

// VITE_FAL_API_KEY is no longer required - all API calls route through backend
const requiredEnvVars = [];
const missingVars = requiredEnvVars.filter(varName => !import.meta.env[varName]);

if (missingVars.length > 0) {
  console.warn('⚠️ Missing required environment variables:', missingVars);
  console.warn('⚠️ Please check your .env file and ensure all required variables are set.');
  console.warn('⚠️ The app will continue to run but some features may not work correctly.');
  
  // Show user-friendly error in the UI using safe DOM methods (prevents XSS)
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
  
  // Use textContent for safe text rendering (prevents XSS)
  const strong = document.createElement('strong');
  strong.textContent = '⚠️ Configuration Required';
  errorDiv.appendChild(strong);
  
  const br1 = document.createElement('br');
  errorDiv.appendChild(br1);
  
  const text1 = document.createTextNode('Backend API URL not configured. Please check VITE_API_URL in your .env file.');
  errorDiv.appendChild(text1);
  
  const br2 = document.createElement('br');
  errorDiv.appendChild(br2);
  
  const small = document.createElement('small');
  const text2 = document.createTextNode('Get your API key from ');
  small.appendChild(text2);
  
  const link = document.createElement('a');
  link.href = 'https://fal.ai';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.color = '#fff';
  link.style.textDecoration = 'underline';
  link.textContent = 'fal.ai';
  small.appendChild(link);
  
  errorDiv.appendChild(small);
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