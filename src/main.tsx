import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App'
import './styles.css'

// HashRouter, not BrowserRouter: the build is a static bundle that has to work
// from a domain root, a GitHub Pages sub-path, or a local file preview without
// any server-side SPA rewrite rules.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
