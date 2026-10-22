import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'
import { initTheme } from './lib/themeMode'
import { registerServiceWorker } from './services/pwaRegistration'

initTheme()
// O service worker é registado aqui (e não dentro do AppShell) para que a app
// funcione offline e possa ser instalada já no ecrã de boas-vindas.
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
