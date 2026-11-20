import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Eye, EyeOff, LayoutGrid, Maximize2, OctagonAlert, Settings2 } from 'lucide-react'
import type { TelemetriaControlador as Sample } from '../api/control'
import { fmt } from '../components/Meters'
import { channels, EncabezadoCanal, lecturaCanal, shutter, useUmbrales, type Channel } from '../components/canalesTelemetria'
import { useSystem } from '../context/SystemContext'
import { HardwareManual } from '../components/HardwareManual'
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
// Con seis o menos tarjetas la grilla queda en 3 × 2: es el tamaño estándar de
// tarjeta y no se agrandan al ocultar otras; las celdas que sobran quedan vacías.
const grilla = (n: number) => ({ '--tc-cols': 3, '--tc-rows': n <= 6 ? 2 : 3 }) as CSSProperties

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
  const enGrilla = editando ? channels : channels.filter(c => !ocultas.includes(c.id) || anormal(c))
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
  // Con GPIO las variables del arreglo llegan en null: se muestran los componentes.
  if (controlador?.modo_hal === 'gpio') return <HardwareManual soloLectura />
  return <>
    {!mobile && vistaHost && createPortal(vista, vistaHost)}
    {editando && !selected && <div className="tc-edicion" role="region" aria-label="Edición del dashboard">
      <p><strong>Edición</strong> <span aria-live="polite">Tocá una tarjeta para mostrarla u ocultarla · {cantidadVisibles} de {channels.length} visibles, mínimo {MINIMO_VISIBLES}</span></p>
      <button type="button" onClick={() => guardarOcultas(() => [])} disabled={!ocultas.length}>Mostrar todas</button>
      <button type="button" className="tc-edicion-listo" autoFocus onClick={() => setEditando(false)}>Listo</button>
    </div>}
    {!selected && <section className={`tc-grid ${cardView === 'B' ? 'tc-simple' : 'tc-pro'} ${editando ? 'tc-editando' : ''}`} style={grilla(enGrilla.length)} aria-label="Telemetría en vivo">
      {enGrilla.map(c => editando ? <button type="button" key={c.id} data-canal={c.id}
        className={`tc-card ${tono(c)} ${ocultas.includes(c.id) ? 'tc-oculta' : ''}`} onClick={() => alternar(c)}
        aria-pressed={!ocultas.includes(c.id)} aria-disabled={bloqueada(c) || undefined} aria-label={`Mostrar ${c.title} en el dashboard`}
        title={bloqueada(c) ? `Tiene que haber al menos ${MINIMO_VISIBLES} tarjetas visibles` : undefined}>
        {heading(c)}<div className="tc-value" style={{ color: color(c) }}>{value(c)} <small>{c.unit}</small></div>
        <div className="tc-foot"><span>{bloqueada(c) ? `Mínimo ${MINIMO_VISIBLES} visibles` : ''}</span>
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
      <div className="tc-detail-head">{heading(selected)}<button type="button" autoFocus onClick={() => setSelected(null)}><ArrowLeft size={18} /> Volver</button></div>
      <div className="tc-detail-summary"><div className="tc-value" style={{ color: color(selected) }}>{value(selected)} <small>{selected.unit}</small></div>{picker}</div>
      <p className="tc-foot">{stats(selected)}</p>{chart(selected, true)}
      <div className="tc-foot"><span>−{windowLabel}</span>{selected.id === 'shutter' && <span><span style={{ color: 'var(--trend)' }}>▬ Arriba abierto · abajo cerrado</span></span>}<span>ahora</span></div>
      <p className="tc-foot">Muestras recibidas en esta sesión. Las interrupciones se muestran como cortes.</p>
    </section>}
  </>
}
