// Tiny DOM helpers — no UI framework, so every line of the Hub is readable.
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/** The standard overlay for full-screen 3D pages: back link, title, notes, toolbar. */
export function overlay(title: string, description?: string) {
  const box = el('div', 'overlay')
  const top = el('div', 'overlay-top')
  const back = el('a', 'btn back', '← Lab')
  back.href = '#/'
  top.append(back, el('h1', '', title))
  box.append(top)
  if (description) box.append(el('p', 'desc', description))
  const toolbar = el('div', 'toolbar')
  box.append(toolbar)
  const addButton = (label: string, onClick: (b: HTMLButtonElement) => void) => {
    const b = el('button', 'btn', label)
    b.onclick = () => onClick(b)
    toolbar.append(b)
    return b
  }
  return { box, toolbar, addButton }
}

export function slider(label: string, min: number, max: number, step: number, value: number, onInput: (v: number) => void) {
  const wrap = el('label', 'slider')
  const name = el('span', '', label)
  const out = el('output', '', String(value))
  const input = Object.assign(document.createElement('input'), { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) })
  input.oninput = () => { out.textContent = input.value; onInput(Number(input.value)) }
  wrap.append(name, input, out)
  return wrap
}
