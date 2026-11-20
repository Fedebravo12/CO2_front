import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Eye, EyeOff, GripVertical, LayoutGrid, Maximize2, OctagonAlert, Settings2 } from 'lucide-react'
import type { TelemetriaControlador as Sample } from '../api/control'
import { fmt } from '../components/Meters'
import { channels, EncabezadoCanal, lecturaCanal, shutter, useUmbrales, type Channel } from '../components/canalesTelemetria'
import { useSystem } from '../context/SystemContext'
import './Telemetria.css'

const VENTANAS = [30, 60, 120]
const etiquetaVentana = (s: number) => s === 120 ? '2 min' : `${s} s`

/* Tarjetas ocultas por el usuario. Se guardan en este navegador; si lo guardado no
 * deja al menos MINIMO_VISIBLES tarjetas, se vuelve a mostrar todo. */
const OCULTAS_KEY = 'co2.telemetria.ocultas'
const MINIMO_VISIBLES = 2
function leerOcultas(): string[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(OCULTAS_KEY) ?? '[]')
    if (!Array.isArray(ids)) return []
    const validas = channels.filter(c => ids.includes(c.id)).map(c => c.id)
    return channels.length - validas.length >= MINIMO_VISIBLES ? validas : []
  } catch { return [] }
}
/* Orden de las tarjetas elegido por el usuario (ids de canal). Los ids que ya no
 * existen se descartan y los canales nuevos se agregan al final. */
const ORDEN_KEY = 'co2.telemetria.orden'
const ORDEN_ORIGINAL = channels.map(c => c.id)
function leerOrden(): string[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(ORDEN_KEY) ?? '[]')
    const guardados = Array.isArray(ids) ? ORDEN_ORIGINAL.filter(id => ids.includes(id)).sort((a, b) => ids.indexOf(a) - ids.indexOf(b)) : []
    return [...guardados, ...ORDEN_ORIGINAL.filter(id => !guardados.includes(id))]
  } catch { return ORDEN_ORIGINAL }
}
/** Saca `id` de su lugar y lo deja en la posición `destino`. */
const moverA = (orden: string[], id: string, destino: number) => {
  const resto = orden.filter(x => x !== id)
  resto.splice(Math.max(0, Math.min(destino, resto.length)), 0, id)
  return resto
}
// Tres columnas y todas las filas del mismo alto. Con seis o menos tarjetas la
// grilla queda en 3 × 2: es el tamaño estándar de tarjeta y no se agrandan al
// ocultar otras; las celdas que sobran quedan vacías. Con más, una fila cada tres,
// hasta 3 × 4. Desde la tarjeta 13 las filas mantienen el alto de 3 × 4 y la grilla
// se desplaza (clase tc-scroll): la cabecera con estado y parada no se mueve.
const MAXIMO_SIN_SCROLL = 12
const grilla = (n: number) => ({ '--tc-cols': 3, '--tc-rows': Math.min(4, Math.max(2, Math.ceil(n / 3))) }) as CSSProperties

/** Engranaje de la barra lateral: ventana de tendencia y gráficos en las tarjetas.
 *  Usa el popover nativo para salir del recorte de la barra; se cierra al tocar
 *  afuera o con Esc, y deja ver el dashboard mientras se cambia la vista. */
function VistaTelemetria({ seconds, onSeconds, tendencias, onTendencias, visibles, onEditar }: { seconds: number; onSeconds: (s: number) => void; tendencias: boolean; onTendencias: (on: boolean) => void; visibles: number; onEditar: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const ubicar = (boton: HTMLElement) => {
    const r = boton.getBoundingClientRect(), p = panel.current
    if (!p) return
    // A la derecha de la barra lateral, alineado con el borde inferior del engranaje.
    const borde = boton.closest('aside')?.getBoundingClientRect().right ?? r.right
    p.style.left = `${borde + 10}px`
    p.style.bottom = `${Math.max(8, window.innerHeight - r.bottom)}px`
  }
  return <>
    <button type="button" className="ghost vista-btn" popoverTarget="vista-telemetria" onClick={e => ubicar(e.currentTarget)} aria-label="Vista del dashboard" title="Vista del dashboard">
      <Settings2 size={18} aria-hidden="true" />
    </button>
    <div ref={panel} id="vista-telemetria" popover="auto" className="vista-pop" role="dialog" aria-label="Vista del dashboard">
      <h3>Vista del dashboard</h3>
      <div className="vista-campo">
        <span id="vista-ventana">Ventana de tendencia</span>
        <div className="vista-seg" role="radiogroup" aria-labelledby="vista-ventana">
          {VENTANAS.map(s => <button key={s} type="button" role="radio" aria-checked={seconds === s} onClick={() => onSeconds(s)}>{etiquetaVentana(s)}</button>)}
        </div>
      </div>
      <label className="vista-campo vista-switch">
        <span>Tendencias en las tarjetas<small>Gráfico chico en cada tarjeta</small></span>
        <input type="checkbox" role="switch" checked={tendencias} onChange={e => onTendencias(e.target.checked)} />
      </label>
      <div className="vista-campo">
        <span>Tarjetas<small>{visibles} de {channels.length} visibles</small></span>
        <button type="button" className="vista-editar" onClick={() => { panel.current?.hidePopover(); onEditar() }}>
          <LayoutGrid size={16} aria-hidden="true" /> Edición
        </button>
      </div>
    </div>
  </>
}

// Teléfono en vertical (angosto) o en horizontal (poca altura).
const MOBILE = '(max-width: 600px), (max-height: 500px)'

export function Telemetria() {
  const { controlador, controladorVivo, historialTelemetria, now, setErrorTelemetria } = useSystem()
  const [seconds, setSeconds] = useState(60)
  const [view, setView] = useState<'B' | 'C'>(() => {
    try { return localStorage.getItem('co2.telemetria.vista') === 'C' ? 'C' : 'B' }
    catch { return 'B' }
  })
  const changeView = (next: 'B' | 'C') => {
    setView(next)
    try { localStorage.setItem('co2.telemetria.vista', next) }
    catch { /* La selección sigue funcionando si el navegador bloquea el almacenamiento. */ }
  }
  // En el teléfono no hay tendencias en las tarjetas ni selector: se ven al tocar
  // una tarjeta. La preferencia guardada para pantallas grandes no se modifica.
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE).matches)
  useEffect(() => {
    const media = window.matchMedia?.(MOBILE)
    if (!media) return
    const change = () => setMobile(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const cardView = mobile ? 'B' : view
  const [selected, setSelected] = useState<Channel | null>(null)
  const [ocultas, setOcultas] = useState<string[]>(leerOcultas)
  const [editando, setEditando] = useState(false)
  const guardarOcultas = (cambio: (ids: string[]) => string[]) => setOcultas(previas => {
    const ids = cambio(previas)
    try { localStorage.setItem(OCULTAS_KEY, JSON.stringify(ids)) }
    catch { /* La selección vale para esta sesión aunque no se pueda guardar. */ }
    return ids
  })
  const cantidadVisibles = channels.length - ocultas.length
  // Ocultar no puede dejar menos del mínimo; mostrar siempre se puede.
  const bloqueada = (c: Channel) => !ocultas.includes(c.id) && cantidadVisibles <= MINIMO_VISIBLES
  const alternar = (c: Channel) => guardarOcultas(ids => ids.includes(c.id)
    ? ids.filter(id => id !== c.id)
    : channels.length - ids.length > MINIMO_VISIBLES ? [...ids, c.id] : ids)
  const [orden, setOrden] = useState<string[]>(leerOrden)
  const guardarOrden = (cambio: (ids: string[]) => string[]) => setOrden(previo => {
    const ids = cambio(previo)
    try { localStorage.setItem(ORDEN_KEY, JSON.stringify(ids)) }
    catch { /* El orden vale para esta sesión aunque no se pueda guardar. */ }
    return ids
  })
  const ordenados = orden.map(id => channels.find(c => c.id === id)!).filter(Boolean)
  // Arrastre con eventos de puntero (mouse, lápiz y táctil). Un toque sin moverse
  // sigue mostrando u ocultando la tarjeta; pasado el umbral, es un arrastre: la
  // tarjeta se levanta y sigue al puntero, y toma el lugar de la que tiene debajo.
  const arrastre = useRef<{ id: string; x: number; y: number; agarreX: number; agarreY: number; activo: boolean } | null>(null)
  const puntero = useRef({ x: 0, y: 0 })
  const recienArrastrada = useRef(false)
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const [anuncio, setAnuncio] = useState('')
  // Posiciones de las tarjetas antes de un cambio de orden, para animar el reacomodo.
  const previas = useRef<Map<string, DOMRect> | null>(null)
  const tarjetasEditables = () => [...document.querySelectorAll<HTMLElement>('.tc-editando [data-canal]')]
  const recordarPosiciones = () => { previas.current = new Map(tarjetasEditables().map(el => [el.dataset.canal!, el.getBoundingClientRect()])) }
  const reordenar = (cambio: (ids: string[]) => string[]) => { recordarPosiciones(); guardarOrden(cambio) }
  const LEVANTADA = 'scale(1.08) rotate(1.5deg)'
  // Lleva la tarjeta levantada bajo el puntero, desde la celda que ocupa en la grilla.
  const seguirPuntero = () => {
    const a = arrastre.current
    const el = a?.activo ? tarjetasEditables().find(t => t.dataset.canal === a.id) : null
    if (!a || !el?.parentElement) return
    const grilla = el.parentElement.getBoundingClientRect()
    const contenedor = el.parentElement
    const dx = puntero.current.x - a.agarreX - (grilla.left + el.offsetLeft - contenedor.scrollLeft)
    const dy = puntero.current.y - a.agarreY - (grilla.top + el.offsetTop - contenedor.scrollTop)
    el.style.transform = `translate(${dx}px, ${dy}px) ${LEVANTADA}`
  }
  // FLIP: cada tarjeta que cambió de celda arranca donde estaba y se desliza a la nueva.
  useLayoutEffect(() => {
    const antes = previas.current
    previas.current = null
    if (!antes) { seguirPuntero(); return }
    const levantada = arrastre.current?.activo ? arrastre.current.id : null
    const base = levantada ? ' scale(.94)' : ''
    for (const el of tarjetasEditables()) {
      const id = el.dataset.canal!
      if (id === levantada || !antes.has(id)) continue
      el.getAnimations().forEach(an => an.cancel())
      const ahora = el.getBoundingClientRect(), previa = antes.get(id)!
      const dx = previa.left - ahora.left, dy = previa.top - ahora.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      el.animate([{ transform: `translate(${dx}px, ${dy}px)${base}` }, { transform: base.trim() || 'none' }], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' })
    }
    seguirPuntero()
  }, [orden])
  const alSoltar = () => {
    const a = arrastre.current
    arrastre.current = null
    if (!a?.activo) return
    recienArrastrada.current = true
    setAnuncio(posicion(a.id, orden))
    setArrastrando(null)
    // La tarjeta baja a su celda con una animación corta, por encima del resto.
    // El estado no espera a la animación: si el navegador la pausa, nada queda trabado.
    const el = tarjetasEditables().find(t => t.dataset.canal === a.id)
    const desde = el?.style.transform
    if (!el || !desde) return
    el.style.transform = ''
    el.style.position = 'relative'
    el.style.zIndex = '5'
    const bajar = el.animate([{ transform: desde }, { transform: 'none' }], { duration: 180, easing: 'ease-out' })
    const fin = () => { el.style.position = ''; el.style.zIndex = '' }
    bajar.onfinish = fin
    bajar.oncancel = fin
    setTimeout(fin, 300)
  }
  const posicion = (id: string, ids: string[]) => `${channels.find(c => c.id === id)?.title}, posición ${ids.indexOf(id) + 1} de ${ids.length}`
  const manejadores = (c: Channel) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      recienArrastrada.current = false
      const r = e.currentTarget.getBoundingClientRect()
      arrastre.current = { id: c.id, x: e.clientX, y: e.clientY, agarreX: e.clientX - r.left, agarreY: e.clientY - r.top, activo: false }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      const a = arrastre.current
      if (!a) return
      puntero.current = { x: e.clientX, y: e.clientY }
      if (!a.activo) {
        if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 8) return
        a.activo = true
        setArrastrando(a.id)
      }
      // Con scroll, acercar la tarjeta al borde de la grilla la desplaza.
      const contenedor = e.currentTarget.parentElement
      if (contenedor && contenedor.scrollHeight > contenedor.clientHeight) {
        const r = contenedor.getBoundingClientRect(), margen = 48
        const paso = e.clientY < r.top + margen ? -16 : e.clientY > r.bottom - margen ? 16 : 0
        if (paso) contenedor.scrollTop += paso
      }
      seguirPuntero()
      // La tarjeta levantada tapa el puntero: se busca la celda por posición. Se usa
      // la celda de la grilla (offset), no el rectángulo en pantalla, que durante el
      // reacomodo está animado y haría saltar la tarjeta de un lugar a otro.
      const debajo = tarjetasEditables().find(t => {
        const contenedor = t.parentElement, grilla = contenedor?.getBoundingClientRect()
        if (t.dataset.canal === a.id || !contenedor || !grilla) return false
        const x = e.clientX - grilla.left - t.offsetLeft + contenedor.scrollLeft, y = e.clientY - grilla.top - t.offsetTop + contenedor.scrollTop
        return x >= 0 && x <= t.offsetWidth && y >= 0 && y <= t.offsetHeight
      })?.dataset.canal
      if (debajo) reordenar(ids => moverA(ids, a.id, ids.indexOf(debajo)))
    },
    onPointerUp: alSoltar,
    onPointerCancel: alSoltar,
  })
  const editar = () => { setSelected(null); setEditando(true) }
  useEffect(() => {
    if (!editando) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditando(false) }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [editando])
  const thresholds = useUmbrales(setErrorTelemetria)
  // El detalle ocupa el lugar de la grilla, sin modal (ADR-0011). Escape vuelve y el
  // foco regresa a la tarjeta del canal que se estaba mirando.
  const ultimoCanal = useRef<string | null>(null)
  useEffect(() => {
    if (!selected) {
      if (ultimoCanal.current) document.querySelector<HTMLElement>(`[data-canal="${ultimoCanal.current}"]`)?.focus()
      return
    }
    ultimoCanal.current = selected.id
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [selected])
  const end = now.getTime(), start = end - seconds * 1000
  const samples = historialTelemetria.filter(s => Date.parse(s.ts) >= start && Date.parse(s.ts) <= end)
  const last = controlador
  const live = controladorVivo && !!last
  const time = last ? new Date(last.ts).toLocaleTimeString('es-AR', { hour12: false }) : '—'
  const notice = !live ? (last ? `Sin datos desde ${time}` : 'Sin datos') : samples.length < 2 ? 'Esperando muestras del controlador…' : ''
  const windowLabel = etiquetaVentana(seconds)
  const leer = (c: Channel) => lecturaCanal(c, last, live, thresholds)
  const limits = (c: Channel) => leer(c).limites
  const value = (c: Channel) => leer(c).valor
  const stats = (c: Channel) => {
    if (c.id === 'shutter') return `${samples.reduce((n, s, i) => n + (i > 0 && Date.parse(s.ts) - Date.parse(samples[i - 1].ts) <= 3500 && shutter(s) !== shutter(samples[i - 1]) ? 1 : 0), 0)} cambios · ${windowLabel}`
    const values = samples.map(c.value).filter(Number.isFinite)
    return values.length ? `mín ${fmt(Math.min(...values), c.digits)} · máx ${fmt(Math.max(...values), c.digits)} · ${windowLabel}` : 'Sin muestras'
  }
  const fuera = (c: Channel) => leer(c).fuera
  const tono = (c: Channel) => leer(c).tono
  const color = (c: Channel) => leer(c).color
  // Una tarjeta oculta vuelve a aparecer mientras su canal esté en advertencia o
  // fuera de límite (ISA-101): ocultarla nunca puede esconder una condición anormal.
  const anormal = (c: Channel) => tono(c) === 'warn' || tono(c) === 'alarm'
  const forzada = (c: Channel) => ocultas.includes(c.id) && anormal(c)
  const enGrilla = editando ? ordenados : ordenados.filter(c => !ocultas.includes(c.id) || anormal(c))
  const heading = (c: Channel) => <EncabezadoCanal c={c} badge={leer(c).badge} />
  const chart = (c: Channel, expanded = false) => {
    const width = 1000, height = expanded ? 320 : 100, padding = 15
    // Shutter: hasta dónde vale cada muestra (1 s si después hay un corte) y la señal abierto/cerrado.
    const hasta = (i: number) => {
      const t = Date.parse(samples[i].ts), next = samples[i + 1] ? Date.parse(samples[i + 1].ts) : end
      return Math.min(end, next - t > 3500 || i === samples.length - 1 ? t + 1000 : next)
    }
    const nivel = (s: Sample) => s.actuadores.shutter_abierto ? height * .25 : height * .75
    const pasos = () => samples.map((s, i) => {
      const t = Date.parse(s.ts), corte = !i || t - Date.parse(samples[i - 1].ts) > 3500
      const tramo = `${corte ? 'M' : `L${x(t)},${nivel(samples[i - 1])} L`}${x(t)},${nivel(s)}`
      const fin = !samples[i + 1] || Date.parse(samples[i + 1].ts) - t > 3500
      return fin ? `${tramo} L${x(hasta(i))},${nivel(s)}` : tramo
    }).join(' ')
    const data = samples.map(s => ({ t: Date.parse(s.ts), v: c.value(s) })).filter(p => Number.isFinite(p.v))
    const bounds = limits(c), values = [...data.map(p => p.v), ...bounds]
    const min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 1
    const margin = Math.max((max - min) * .08, Math.abs(max) * .01, .01)
    const low = min - margin, high = max + margin
    const x = (t: number) => (t - start) / (end - start) * width
    const y = (v: number) => padding + (high - v) / (high - low) * (height - padding * 2)
    const path = data.map((p, i) => `${!i || p.t - data[i - 1].t > 3500 ? 'M' : 'L'}${x(p.t)},${y(p.v)}`).join(' ')
    const segments: typeof data[] = []
    data.forEach((point, i) => {
      if (!i || point.t - data[i - 1].t > 3500) segments.push([])
      segments[segments.length - 1].push(point)
    })
    const area = segments.filter(segment => segment.length > 1).map(segment =>
      `M${x(segment[0].t)},${height} ${segment.map(p => `L${x(p.t)},${y(p.v)}`).join(' ')} L${x(segment[segment.length - 1].t)},${height} Z`,
    ).join(' ')
    const latest = data[data.length - 1]
    return <div className={`tc-plot ${expanded ? 'expanded' : ''}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${c.title}, últimos ${windowLabel}`}>
        {c.id === 'shutter' ? <>
          {/* Abierto/cerrado como señal escalonada. */}
          <path d={pasos()} fill="none" stroke="var(--trend)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity={live ? 1 : .3} />
        </> : <>
          {/* Los límites se dibujan discretos; el rojo aparece recién cuando se cruzan. */}
          {bounds.map((v, i) => <line key={i} x1="0" x2={width} y1={y(v)} y2={y(v)} stroke="var(--trend-limit)" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill="var(--trend)" opacity={live ? .12 : .04} />
          <path d={path} fill="none" stroke="var(--trend)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity={live ? 1 : .3} />
        </>}
      </svg>
      {c.id !== 'shutter' && bounds.map((v, i) => <span className="tc-limit" key={i} style={{ top: `${y(v) / height * 100}%` }}>Límite {fmt(v, c.digits)} {c.unit}</span>)}
      {expanded && c.id !== 'shutter' && <div className="tc-axis"><span>{fmt(high, c.digits)}</span><span>{fmt((high + low) / 2, c.digits)}</span><span>{fmt(low, c.digits)}</span></div>}
      {live && latest && c.id !== 'shutter' && <i className="tc-dot" style={{ left: `${x(latest.t) / width * 100}%`, top: `${y(latest.v) / height * 100}%`, background: fuera(c) ? 'var(--red)' : 'var(--trend-strong)' }} />}
      {notice && <div className="tc-notice"><span>{notice}</span></div>}
    </div>
  }
  const picker = <label className="tc-window">Ventana <select aria-label="Ventana de tendencia" value={seconds} onChange={e => setSeconds(Number(e.target.value))}>{VENTANAS.map(s => <option key={s} value={s}>{etiquetaVentana(s)}</option>)}</select></label>
  const vista = <VistaTelemetria seconds={seconds} onSeconds={setSeconds} tendencias={view === 'C'} onTendencias={on => changeView(on ? 'C' : 'B')} visibles={cantidadVisibles} onEditar={editar} />
  const vistaHost = document.getElementById('telemetria-vista')
  return <>
    {!mobile && vistaHost && createPortal(vista, vistaHost)}
    {editando && !selected && <div className="tc-edicion" role="region" aria-label="Edición del dashboard">
      <p><strong>Edición</strong> <span>Tocá una tarjeta para mostrarla u ocultarla y arrastrala para cambiarla de lugar · <span aria-live="polite">{cantidadVisibles} de {channels.length} visibles, mínimo {MINIMO_VISIBLES}</span></span></p>
      <span className="tc-sr" aria-live="assertive">{anuncio}</span>
      <button type="button" onClick={() => guardarOcultas(() => [])} disabled={!ocultas.length}>Mostrar todas</button>
      <button type="button" className="tc-edicion-listo" autoFocus onClick={() => setEditando(false)}>Listo</button>
    </div>}
    {!selected && <section className={`tc-grid ${cardView === 'B' ? 'tc-simple' : 'tc-pro'} ${editando ? 'tc-editando' : ''} ${arrastrando ? 'tc-reordenando' : ''} ${enGrilla.length <= 6 ? 'tc-amplia' : ''} ${enGrilla.length > MAXIMO_SIN_SCROLL ? 'tc-scroll' : ''}`} style={grilla(enGrilla.length)} aria-label="Telemetría en vivo">
      {enGrilla.map(c => editando ? <button type="button" key={c.id} data-canal={c.id}
        className={`tc-card ${ocultas.includes(c.id) ? 'tc-oculta' : ''} ${arrastrando === c.id ? 'tc-arrastrando' : ''}`} {...manejadores(c)}
        onClick={() => { if (recienArrastrada.current) recienArrastrada.current = false; else alternar(c) }}
        aria-pressed={!ocultas.includes(c.id)} aria-disabled={bloqueada(c) || undefined} aria-label={`Mostrar ${c.title} en el dashboard`}
        title={bloqueada(c) ? `Tiene que haber al menos ${MINIMO_VISIBLES} tarjetas visibles` : undefined}>
        {heading(c)}<div className="tc-value" style={{ color: color(c) }}>{value(c)} <small>{c.unit}</small></div>
        <div className="tc-foot"><span className="tc-agarre"><GripVertical size={14} aria-hidden="true" />{bloqueada(c) ? `Mínimo ${MINIMO_VISIBLES} visibles` : 'Arrastrar'}</span>
          <span className="tc-edit-chip">{ocultas.includes(c.id) ? <><EyeOff size={14} aria-hidden="true" /> Oculta</> : <><Eye size={14} aria-hidden="true" /> Visible</>}</span></div>
      </button> : <button type="button" key={c.id} data-canal={c.id} className={`tc-card ${tono(c)} ${forzada(c) ? 'tc-forzada' : ''}`} onClick={() => setSelected(c)} aria-label={`Ampliar ${c.title}${forzada(c) ? ' (tarjeta oculta, visible por la condición anormal)' : ''}`}>
        {heading(c)}<div className="tc-value" style={{ color: color(c) }}>{fuera(c) && <OctagonAlert className="tc-value-alarma" aria-label="Fuera de límite" />}{value(c)} <small>{c.unit}</small></div>
        {c.id === 'prog' ? <div className="tc-progress" role="progressbar" aria-label="Progreso del proceso" aria-valuenow={live ? Math.min(100, Math.max(0, c.value(last))) : undefined}><i style={{ width: `${live ? Math.min(100, Math.max(0, c.value(last))) : 0}%` }} /></div> : cardView === 'C' ? chart(c) : null}
        <div className="tc-foot"><span>{stats(c)}</span>{forzada(c)
          ? <span className="tc-forzada-marca" title="Tarjeta oculta: se muestra mientras dure la condición anormal"><EyeOff size={13} aria-hidden="true" /> Oculta</span>
          : <span><Maximize2 size={13} /> {cardView === 'B' ? 'Tendencia' : 'Ampliar'}</span>}</div>
      </button>)}
    </section>}
    {selected && <section className="tc-detail tc-detalle-panel" aria-label={`Tendencia de ${selected.title}`}>
      <div className="tc-detail-volver"><button type="button" autoFocus onClick={() => setSelected(null)}><ArrowLeft size={15} aria-hidden="true" /> Volver</button></div>
      <div className="tc-detail-head">{heading(selected)}</div>
      <div className="tc-detail-summary"><div className="tc-value" style={{ color: color(selected) }}>{value(selected)} <small>{selected.unit}</small></div>{picker}</div>
      <p className="tc-foot">{stats(selected)}</p>{chart(selected, true)}
      <div className="tc-foot"><span>−{windowLabel}</span>{selected.id === 'shutter' && <span><span style={{ color: 'var(--trend)' }}>▬ Arriba abierto · abajo cerrado</span></span>}<span>ahora</span></div>
      <p className="tc-foot">Muestras recibidas en esta sesión. Las interrupciones se muestran como cortes.</p>
    </section>}
  </>
}
