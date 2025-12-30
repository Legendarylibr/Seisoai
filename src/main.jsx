// CRITICAL: Buffer polyfill must be imported FIRST before anything else
// This replaces the minimal shim from index.html with the full implementation
import { Buffer } from 'buffer'
window.Buffer = Buffer
globalThis.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)