// CRITICAL: Buffer polyfill must be imported FIRST before anything else
// This replaces the minimal shim from index.html with the full implementation
import { Buffer } from 'buffer';
(window as Window & { Buffer: typeof Buffer }).Buffer = Buffer;
(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


