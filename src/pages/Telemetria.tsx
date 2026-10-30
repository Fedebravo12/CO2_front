import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Aperture, Droplets, Gauge, Maximize2, MoveHorizontal, Sun, Target, Thermometer, Timer, TrendingUp, X, Zap } from 'lucide-react'
import type { TelemetriaControlador as Sample } from '../api/control'
import { api } from '../api/client'
import type { Umbral } from '../mock/types'
import { fmt } from '../components/Meters'
import { useSystem } from '../context/SystemContext'
import './Telemetria.css'

type Tone = 'ok' | 'info' | 'warn' | 'neutral'
type Channel = { id: string; title: string; unit: string; color: string; digits: number; icon: typeof Sun; value: (s: Sample) => number; parameter?: string; factor?: number; badge?: (s: Sample) => [string, Tone] }
const shutter = (s: Sample) => s.actuadores.shutter_abierto ? 'Abierto' : s.actuadores.shutter_armado ? 'Armado' : 'Desarmado'
const shutterColors = { Abierto: 'var(--blue)', Armado: 'var(--green)', Desarmado: 'var(--dim)' }
const channels: Channel[] = [
  { id: 'pot', title: 'POTENCIA LÁSER', unit: 'W', color: 'blue', digits: 2, icon: Sun, parameter: 'POTENCIA_LASER', value: s => s.variables.POTENCIA_LASER, badge: s => s.actuadores.laser ? ['Encendido', 'ok'] : ['Apagado', 'neutral'] },
  // Sin grabado en curso no hay tiempo de pulso: NaN se muestra como «—».
  { id: 'pulso', title: 'TIEMPO DE PULSO', unit: 'ms', color: 'blue', digits: 0, icon: Timer, value: s => s.ejecucion?.duracion_pulso_ms ?? NaN },
  { id: 'shutter', title: 'SHUTTER', unit: '', color: 'blue', digits: 0, icon: Aperture, value: () => 0, badge: s => [shutter(s), s.actuadores.shutter_abierto ? 'info' : s.actuadores.shutter_armado ? 'ok' : 'neutral'] },
  { id: 'hv', title: 'ALTA TENSIÓN', unit: 'kV', color: 'orange', digits: 1, icon: Zap, parameter: 'TENSION_AT', value: s => s.variables.TENSION_AT, badge: s => s.condiciones.AT_ENCENDIDA ? ['Activa', 'ok'] : ['Apagada', 'neutral'] },
  { id: 'sombra', title: 'SENSOR DE SOMBRA', unit: 'mW', color: 'yellow', digits: 2, icon: Target, value: s => s.extra.sensor_sombra_mw, badge: s => s.condiciones.FIBRA_ALINEADA ? ['Alineada', 'ok'] : ['No alineada', 'warn'] },
  { id: 'temp', title: 'TEMP. REFRIGERACIÓN', unit: '°C', color: 'teal', digits: 1, icon: Thermometer, parameter: 'TEMPERATURA_AGUA', value: s => s.variables.TEMPERATURA_AGUA, badge: s => s.condiciones.REFRIGERACION_OK ? ['Estable', 'ok'] : s.actuadores.refrigeracion ? ['Estabilizando', 'warn'] : ['Apagada', 'neutral'] },
  { id: 'caudal', title: 'CAUDAL REFRIGERANTE', unit: 'L/min', color: 'green', digits: 2, icon: Droplets, parameter: 'CAUDAL_REFRIGERANTE', value: s => s.variables.CAUDAL_REFRIGERANTE },
  { id: 'pos', title: 'POSICIÓN DESPLAZADOR', unit: 'µm', color: 'green', digits: 0, icon: MoveHorizontal, parameter: 'POSICION_MOTOR', factor: 1000, value: s => s.variables.POSICION_MOTOR * 1000, badge: s => s.ejecucion ? ['En curso', 'info'] : ['Detenido', 'ok'] },
  { id: 'prog', title: 'PROGRESO DEL PROCESO', unit: '%', color: 'teal', digits: 0, icon: Gauge, value: s => (s.ejecucion?.progreso ?? 0) * 100 },
]

const MOBILE = '(max-width: 600px)'

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
  const [thresholds, setThresholds] = useState<Umbral[]>([])
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    let active = true
    api.listarUmbrales().then(data => { if (active) { setThresholds(data.filter(u => u.activo)); setErrorTelemetria(null) } }).catch(() => { if (active) setErrorTelemetria('No se pudieron cargar los límites configurados.') })
    return () => { active = false; setErrorTelemetria(null) }
  }, [setErrorTelemetria])
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
  const windowLabel = seconds === 120 ? '2 min' : `${seconds} s`
  const limits = (c: Channel) => thresholds.filter(u => c.parameter && u.variable === c.parameter).flatMap(u => [u.min, u.max]).map(v => v * (c.factor ?? 1)).filter(Number.isFinite)
  const value = (c: Channel) => live && Number.isFinite(c.value(last)) ? (c.id === 'shutter' ? shutter(last) : fmt(c.value(last), c.digits)) : '—'
  const stats = (c: Channel) => {
    if (c.id === 'shutter') return `${samples.reduce((n, s, i) => n + (i > 0 && Date.parse(s.ts) - Date.parse(samples[i - 1].ts) <= 3500 && shutter(s) !== shutter(samples[i - 1]) ? 1 : 0), 0)} cambios · ${windowLabel}`
    const values = samples.map(c.value).filter(Number.isFinite)
    return values.length ? `mín ${fmt(Math.min(...values), c.digits)} · máx ${fmt(Math.max(...values), c.digits)} · ${windowLabel}` : 'Sin muestras'
  }
  const color = (c: Channel) => {
    const bounds = limits(c)
    return !live ? 'var(--dim)' : bounds.length && (c.value(last) < Math.min(...bounds) || c.value(last) > Math.max(...bounds)) ? 'var(--red)' : `var(--${c.color})`
  }
  const heading = (c: Channel) => {
    const badge = c.badge ? (live ? c.badge(last) : ['Sin datos', 'neutral']) : null
    return <div className="tc-heading"><span className="tc-icon"><c.icon size={19} /></span><h3 title={c.title}>{c.title}</h3>{badge && <span className={`tc-badge ${badge[1]}`}>{badge[0]}</span>}</div>
  }
  const chart = (c: Channel, expanded = false) => {
    const width = 1000, height = expanded ? 320 : 100, padding = 15
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
        {c.id === 'shutter' ? samples.map((s, i) => {
          const t = Date.parse(s.ts), next = samples[i + 1] ? Date.parse(samples[i + 1].ts) : end
          const until = Math.min(end, next - t > 3500 || i === samples.length - 1 ? t + 1000 : next)
          return <rect key={s.ts} x={x(t)} y={height * .3} width={Math.max(0, x(until) - x(t))} height={height * .4} fill={shutterColors[shutter(s)]} opacity={live ? 1 : .3} />
        }) : <>
          {bounds.map((v, i) => <line key={i} x1="0" x2={width} y1={y(v)} y2={y(v)} stroke="var(--red)" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill={`var(--${c.color})`} opacity={live ? .1 : .03} />
          <path d={path} fill="none" stroke={`var(--${c.color})`} strokeWidth="2" vectorEffect="non-scaling-stroke" opacity={live ? 1 : .3} />
        </>}
      </svg>
      {c.id !== 'shutter' && bounds.map((v, i) => <span className="tc-limit" key={i} style={{ top: `${y(v) / height * 100}%` }}>Límite {fmt(v, c.digits)} {c.unit}</span>)}
      {expanded && c.id !== 'shutter' && <div className="tc-axis"><span>{fmt(high, c.digits)}</span><span>{fmt((high + low) / 2, c.digits)}</span><span>{fmt(low, c.digits)}</span></div>}
      {live && latest && c.id !== 'shutter' && <i className="tc-dot" style={{ left: `${x(latest.t) / width * 100}%`, top: `${y(latest.v) / height * 100}%`, background: `var(--${c.color})` }} />}
      {notice && <div className="tc-notice"><span>{notice}</span></div>}
    </div>
  }
  const picker = <label className="tc-window">Ventana <select aria-label="Ventana de tendencia" value={seconds} onChange={e => setSeconds(Number(e.target.value))}>{[30, 60, 120].map(s => <option key={s} value={s}>{s === 120 ? '2 min' : `${s} s`}</option>)}</select></label>
  const toolbar = <div className="tc-toolbar">
    {picker}
    <button type="button" className="tc-view-toggle" aria-pressed={view === 'C'}
      onClick={() => changeView(view === 'C' ? 'B' : 'C')}
      title={view === 'C' ? 'Ocultar tendencias en las tarjetas' : 'Mostrar tendencias en las tarjetas'}>
      <TrendingUp size={15} aria-hidden="true" /> Tendencias
    </button>
  </div>
  const toolbarHost = document.getElementById('telemetria-toolbar')
  return <>
    {!mobile && (toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar)}
    <section className={`tc-grid ${cardView === 'B' ? 'tc-simple' : 'tc-pro'}`} aria-label="Telemetría en vivo">
      {channels.map(c => <button type="button" key={c.id} className={`tc-card ${live && c.badge ? c.badge(last)[1] : 'neutral'}`} onClick={() => setSelected(c)} aria-label={`Ampliar ${c.title}`}>
        {heading(c)}<div className="tc-value" style={{ color: color(c) }}>{value(c)} <small>{c.unit}</small></div>
        {c.id === 'prog' ? <div className="tc-progress" role="progressbar" aria-label="Progreso del proceso" aria-valuenow={live ? Math.min(100, Math.max(0, c.value(last))) : undefined}><i style={{ width: `${live ? Math.min(100, Math.max(0, c.value(last))) : 0}%` }} /></div> : cardView === 'C' ? chart(c) : null}
        <div className="tc-foot"><span>{stats(c)}</span><span><Maximize2 size={13} /> {cardView === 'B' ? 'Tendencia' : 'Ampliar'}</span></div>
      </button>)}
    </section>
    {selected && <dialog ref={dialog} className="tc-dialog" onCancel={() => setSelected(null)} onClick={e => { if (e.target === e.currentTarget) setSelected(null) }} aria-label={selected.title}>
      <div className="tc-detail">
        <div className="tc-detail-head">{heading(selected)}<button type="button" autoFocus onClick={() => setSelected(null)} aria-label="Cerrar detalle"><X size={20} /></button></div>
        <div className="tc-detail-summary"><div className="tc-value" style={{ color: color(selected) }}>{value(selected)} <small>{selected.unit}</small></div>{picker}</div>
        <p className="tc-foot">{stats(selected)}</p>{chart(selected, true)}
        <div className="tc-foot"><span>−{windowLabel}</span>{selected.id === 'shutter' && <span>{Object.entries(shutterColors).map(([label, shade]) => <span key={label} style={{ color: shade }}>● {label} </span>)}</span>}<span>ahora</span></div>
        <p className="tc-foot">Muestras recibidas en esta sesión. Las interrupciones se muestran como cortes.</p>
      </div>
    </dialog>}
  </>
}
