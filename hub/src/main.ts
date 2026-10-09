// Entry point + router. Routes live in the URL hash (#/scene/xyz) so the app works
// as static files on GitHub Pages and when installed on a phone.
import './styles.css'
import { dashboard } from './pages/dashboard'
import { modelsPage } from './pages/models'
import { pipelinePage } from './pages/pipeline'
import { scenePage } from './pages/scenePage'
import { el } from './ui'

const app = document.getElementById('app')!
let cleanup: () => void = () => {}

function route() {
  cleanup()
  app.innerHTML = ''
  const [, kind, id] = location.hash.replace(/^#\/?/, '/').split('/')
  try {
    if (kind === 'scene' && id) cleanup = scenePage(app, decodeURIComponent(id))
    else if (kind === 'module' && id === 'pipeline') cleanup = pipelinePage(app)
    else if (kind === 'module' && id === 'models') cleanup = modelsPage(app)
    else cleanup = dashboard(app)
  } catch (e) {
    // textContent, never innerHTML, for messages: they can contain text from scene files.
    const msg = el('p', 'error pad', `Something broke: ${(e as Error).message}`)
    const back = el('a', 'btn back', '← Back to the lab')
    back.href = '#/'
    app.append(msg, back)
    cleanup = () => {}
  }
  window.scrollTo(0, 0)
}

window.addEventListener('hashchange', route)
route()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
