import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, OctagonAlert, Settings2, X } from 'lucide-react'
import type { TelemetriaControlador as Sample } from '../api/control'
import { fmt } from '../components/Meters'
import { channels, EncabezadoCanal, lecturaCanal, shutter, useUmbrales, type Channel } from '../components/canalesTelemetria'
import { useSystem } from '../context/SystemContext'
import './Telemetria.css'

const VENTANAS = [30, 60, 120]
const etiquetaVentana = (s: number) => s === 120 ? '2 min' : `${s} s`

/** Engranaje de la barra lateral: ventana de tendencia y gráficos en las tarjetas.
 *  Usa el popover nativo para salir del recorte de la barra; se cierra al tocar
 *  afuera o con Esc, y deja ver el dashboard mientras se cambia la vista. */
function VistaTelemetria({ seconds, onSeconds, tendencias, onTendencias }: { seconds: number; onSeconds: (s: number) => void; tendencias: boolean; onTendencias: (on: boolean) => void }) {
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
  const thresholds = useUmbrales(setErrorTelemetria)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!selected) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    return () => { dialog.current?.close(); previous?.focus() }
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
  const vista = <VistaTelemetria seconds={seconds} onSeconds={setSeconds} tendencias={view === 'C'} onTendencias={on => changeView(on ? 'C' : 'B')} />
  const vistaHost = document.getElementById('telemetria-vista')
  return <>
    {!mobile && vistaHost && createPortal(vista, vistaHost)}
    <section className={`tc-grid ${cardView === 'B' ? 'tc-simple' : 'tc-pro'}`} aria-label="Telemetría en vivo">
      {channels.map(c => <button type="button" key={c.id} className={`tc-card ${tono(c)}`} onClick={() => setSelected(c)} aria-label={`Ampliar ${c.title}`}>
        {heading(c)}<div className="tc-value" style={{ color: color(c) }}>{fuera(c) && <OctagonAlert className="tc-value-alarma" aria-label="Fuera de límite" />}{value(c)} <small>{c.unit}</small></div>
        {c.id === 'prog' ? <div className="tc-progress" role="progressbar" aria-label="Progreso del proceso" aria-valuenow={live ? Math.min(100, Math.max(0, c.value(last))) : undefined}><i style={{ width: `${live ? Math.min(100, Math.max(0, c.value(last))) : 0}%` }} /></div> : cardView === 'C' ? chart(c) : null}
        <div className="tc-foot"><span>{stats(c)}</span><span><Maximize2 size={13} /> {cardView === 'B' ? 'Tendencia' : 'Ampliar'}</span></div>
      </button>)}
    </section>
    {selected && <dialog ref={dialog} className="tc-dialog" onCancel={() => setSelected(null)} onClick={e => { if (e.target === e.currentTarget) setSelected(null) }} aria-label={selected.title}>
      <div className="tc-detail">
        <div className="tc-detail-head">{heading(selected)}<button type="button" autoFocus onClick={() => setSelected(null)} aria-label="Cerrar detalle"><X size={20} /></button></div>
        <div className="tc-detail-summary"><div className="tc-value" style={{ color: color(selected) }}>{value(selected)} <small>{selected.unit}</small></div>{picker}</div>
        <p className="tc-foot">{stats(selected)}</p>{chart(selected, true)}
        <div className="tc-foot"><span>−{windowLabel}</span>{selected.id === 'shutter' && <span><span style={{ color: 'var(--trend)' }}>▬ Arriba abierto · abajo cerrado</span></span>}<span>ahora</span></div>
        <p className="tc-foot">Muestras recibidas en esta sesión. Las interrupciones se muestran como cortes.</p>
      </div>
    </dialog>}
  </>
}
