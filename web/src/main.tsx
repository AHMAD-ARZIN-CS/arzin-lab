import { createRoot } from 'react-dom/client'
import { App } from './App'
import { onConnection } from './lib/socket'
import { boot, setState, toast } from './lib/store'
import './styles.css'

onConnection((connected) => setState({ connected }))
createRoot(document.getElementById('root')!).render(<App />)
boot().catch((e) => toast(`Could not reach the workspace server: ${e.message}`))

// Don't lose unsaved edits by closing the tab.
window.addEventListener('beforeunload', (e) => {
  if (document.querySelector('.tab .dirty')) e.preventDefault()
})
