import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Records the first page of this tab, for the landing intro.
import './utils/introGate'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
