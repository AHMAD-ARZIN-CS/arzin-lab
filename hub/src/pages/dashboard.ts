import { MODULES, SCENES, setLocalScene } from '../registry'
import { validateScene } from '../scene/spec'
import { TRACKS } from '../tracks'
import { el } from '../ui'

export function dashboard(root: HTMLElement) {
  const page = el('div', 'dashboard')
  const header = el('header', 'dash-header')
  header.append(
    el('h1', '', 'Arzin Lab'),
    el('p', 'tagline', 'Build it. Understand every layer. See it in 3D.'),
  )

  // Open any scene JSON from this device — e.g. one an agent just wrote for you.
  const picker = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true })
  const openBtn = el('button', 'btn', 'Open scene file…')
  openBtn.onclick = () => picker.click()
  const err = el('p', 'error')
  picker.onchange = async () => {
    const file = picker.files?.[0]
    if (!file) return
    try {
      setLocalScene(validateScene(JSON.parse(await file.text())))
      location.hash = '#/scene/local'
    } catch (e) {
      err.textContent = `Could not open ${file.name}: ${(e as Error).message}`
    }
  }
  header.append(openBtn, picker, err)
  page.append(header)

  for (const track of TRACKS) {
    const items = [
      ...MODULES.filter((m) => m.track === track.id).map((m) => ({ title: m.title, desc: m.description, href: `#/module/${m.id}`, kind: 'interactive' })),
      ...SCENES.filter((s) => s.track === track.id).map((s) => ({ title: s.title, desc: s.description ?? '', href: `#/scene/${s.id}`, kind: 'scene' })),
    ]
    const section = el('section', `track ${track.status}`)
    section.style.setProperty('--track', track.color)
    const head = el('div', 'track-head')
    head.append(el('h2', '', track.name), el('span', 'status', track.status === 'active' ? 'active' : 'planned'))
    section.append(head, el('p', 'blurb', track.blurb))

    const grid = el('div', 'cards')
    for (const it of items) {
      const a = el('a', 'card')
      a.href = it.href
      a.append(el('span', 'kind', it.kind), el('h3', '', it.title), el('p', '', it.desc))
      grid.append(a)
    }
    for (const up of track.upcoming ?? []) {
      const c = el('div', 'card upcoming')
      c.append(el('span', 'kind', 'coming'), el('h3', '', up))
      grid.append(c)
    }
    if (grid.children.length) section.append(grid)
    page.append(section)
  }

  page.append(el('footer', 'foot', `${SCENES.length} scenes · ${MODULES.length} interactive modules`))
  root.append(page)
  return () => {}
}
