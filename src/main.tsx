import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// WHY tldraw.css before app.css: app.css's .tl-container token bridge reads
// tldraw's own --tl-* variables, which tldraw.css is what declares.
import 'tldraw/tldraw.css'
import './styles/host.css'
import './styles/app.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
