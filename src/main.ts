import './style.css'
import './ui/ui.css'
import { api, auth, usingMock, type Session } from './api'
import { setCurrency } from './ui/format'
import { errorMessage } from './ui/feedback'
import { html } from './ui/html'
import { app, type View } from './ui/state'
import { renderLogin } from './views/login'
import { OAUTH_CONSENT_PATH, renderOAuthConsent } from './views/oauth'
import { resumen } from './views/resumen'
import { gastos } from './views/gastos'
import { fijos } from './views/fijos'
import { inversiones } from './views/inversiones'
import { deudas } from './views/deudas'
import { cuentas } from './views/cuentas'
import { etiquetas } from './views/etiquetas'
import { ajustes } from './views/ajustes'

const NAV: [string, string, string, View][] = [
  ['resumen', '🏠', 'Resumen', resumen],
  ['gastos', '🛒', 'Gastos', gastos],
  ['fijos', '🔁', 'Fijos', fijos],
  ['inversiones', '📈', 'Inversiones', inversiones],
  ['deudas', '🤝', 'Deudas', deudas],
  ['cuentas', '🏦', 'Cuentas', cuentas],
  ['etiquetas', '🏷️', 'Etiquetas', etiquetas],
  ['ajustes', '⚙️', 'Ajustes', ajustes],
]

const root = document.querySelector<HTMLDivElement>('#app')!
let session: Session | null = null
let main: HTMLElement | null = null
let renderId = 0

// ---------- Tema ----------

const THEME_KEY = 'pf-theme'
try {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved
} catch { /* sin almacenamiento */ }

function toggleTheme() {
  const r = document.documentElement
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  r.dataset.theme = dark ? 'light' : 'dark'
  try { localStorage.setItem(THEME_KEY, r.dataset.theme) } catch { /* sin almacenamiento */ }
}

// ---------- Navegación ----------

const currentTab = () => NAV.find(n => n[0] === location.hash.slice(1)) ?? NAV[0]

function renderShell() {
  root.innerHTML = html`
    <button class="btn ghost sm theme-toggle" id="theme" title="Cambiar tema">◐ Tema</button>
    <div class="app">
      <aside>
        <div class="brand"><i></i>Finanzas personales</div>
        <nav id="nav" aria-label="Secciones"></nav>
        ${usingMock ? html`<div class="mockbar">Modo demo · los datos se guardan solo en este navegador</div>` : ''}
      </aside>
      <main id="main"></main>
    </div>`.value
  root.querySelector('#theme')!.addEventListener('click', toggleTheme)
  main = root.querySelector('#main')
}

async function renderView(resetScroll: boolean) {
  if (!main) return
  const [id, , , view] = currentTab()
  root.querySelector('#nav')!.innerHTML = NAV.map(([key, ico, label]) => html`
    <a href="#${key}" class="${key === id ? 'active' : ''}" ${key === id ? 'aria-current="page"' : ''}><span class="ico">${ico}</span>${label}</a>`.value).join('')
  // Cada pantalla pinta en un contenedor nuevo; si mientras tanto se navegó a otra, se descarta.
  const mine = ++renderId
  const target = document.createElement('div')
  const scroll = window.scrollY
  try {
    await view(target)
  } catch (e) {
    target.innerHTML = html`<div class="card load-error"><strong>No se pudo cargar esta pantalla</strong><p class="muted">${errorMessage(e)}</p><button class="btn ghost sm" data-retry>Reintentar</button></div>`.value
    target.querySelector('[data-retry]')!.addEventListener('click', () => renderView(false))
  }
  if (mine !== renderId) return
  main.replaceChildren(target)
  window.scrollTo(0, resetScroll ? 0 : scroll)
}

app.refresh = () => renderView(false)

async function start(s: Session | null) {
  session = s
  if (!session) {
    main = null
    renderLogin(root)
    return
  }
  if (location.pathname === OAUTH_CONSENT_PATH) {
    main = null
    await renderOAuthConsent(root)
    return
  }
  app.email = session.email
  try {
    setCurrency(await api.getCurrency())
  } catch { /* se usa EUR; el error se verá al cargar la pantalla */ }
  if (!main) renderShell()
  await renderView(true)
}

window.addEventListener('hashchange', () => { if (session) renderView(true) })

auth.onAuthChange(s => {
  // Evita repintar en refrescos de token del mismo usuario.
  if (s?.userId === session?.userId && !!s === !!session) return
  start(s)
})

auth.getSession()
  .then(start)
  .catch(e => {
    root.innerHTML = html`<div class="login"><section class="card">${errorMessage(e)}</section></div>`.value
  })
