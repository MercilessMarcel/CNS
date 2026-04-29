import React from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App'
import { logger } from './lib/logger'
import './index.css'

console.log('[CNS] Application starting...')
logger.init()
logger.info('App startup initiated')

const root = document.getElementById('root')
if (!root) {
  console.error('[CNS] Fatal: root element not found')
  logger.error('Root element not found')
} else {
  logger.info('Root element found, mounting React')
  try {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    )
    logger.info('React mounted successfully')
  } catch (err) {
    logger.error('React mount failed', err)
  }
}
