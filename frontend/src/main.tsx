import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { handleStoreAuthFailure } from '@/features/accounts/queries'
import { handlePlatformAuthFailure } from '@/features/platform/identity'
import { setAuthFailureHandler, setPlatformAuthFailureHandler } from '@/lib/api'

// A rejected credential for one identity clears that identity's cached data in this tab.
setAuthFailureHandler(handleStoreAuthFailure)
setPlatformAuthFailureHandler(handlePlatformAuthFailure)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
