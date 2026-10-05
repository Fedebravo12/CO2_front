import { useState } from 'react'
import { useSystem } from '../context/SystemContext'
import { fmt } from './Meters'

export function TendenciasTelemetria() {
  const { historialTelemetria, controladorVivo, now } = useSystem()
  const [segundos, setSegundos] = useState(60)
  const end = now.getTime()
  const start = end - segundos * 1000
  const samples = historialTelemetria.filter(t => Date.parse(t.ts) >= start && Date.parse(t.ts) <= end)
  const channels = [
    { title: 'Potencia del láser', unit: 'W', color: '#4aa3ff', value: (v: typeof samples[number]) => v.variables.POTENCIA_LASER },
    { title: 'Temperatura del agua', unit: '°C', color: '#2ad4c4', value: (v: typeof samples[number]) => v.variables.TEMPERATURA_AGUA },
  ]
  return <section className="trend-section">
    <div className="trend-heading"><div><span className="chart-eyebrow">EVOLUCIÓN DEL EQUIPO</span><h2>Tendencias en tiempo real</h2></div><div className="trend-window" aria-label="Ventana de tiempo">{[30, 60, 120].map(s => <button key={s} aria-pressed={segundos === s} onClick={() => setSegundos(s)}>{s < 120 ? `${s} s` : '2 min'}</button>)}</div></div>
    <div className="trend-grid">{channels.map(channel => {
      const data = samples.map(t => ({ time: Date.parse(t.ts), value: channel.value(t) }))
      const values = data.map(t => t.value)
      const min = values.length ? Math.min(...values) : 0
      const max = values.length ? Math.max(...values) : 1
      const margin = Math.max((max - min) * .15, channel.unit === 'W' ? .5 : .3)
      const low = Math.floor(min - margin), high = Math.ceil(max + margin)
      const x = (time: number) => 56 + (time - start) / (end - start) * 550
      const y = (value: number) => 30 + (high - value) / (high - low || 1) * 140
      const path = data.map((p, i) => `${!i || p.time - data[i - 1].time > 3500 ? 'M' : 'L'}${x(p.time).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')
      return <article className="trend-card" key={channel.title}><div className="trend-card-head"><h3><i style={{ background: channel.color }} />{channel.title}</h3><b style={{ color: channel.color }}>{controladorVivo && data.length ? fmt(data[data.length - 1].value, 1) : '—'} <small>{channel.unit}</small></b></div>
        <svg viewBox="0 0 630 210" role="img" aria-label={`${channel.title} durante los últimos ${segundos} segundos`}>
          {[0, 1, 2, 3].map(i => { const value = low + (high - low) * i / 3; return <g key={i}><line x1="56" x2="606" y1={y(value)} y2={y(value)} stroke="#243342" strokeDasharray="3 5" /><text x="44" y={y(value) + 4} textAnchor="end" fill="#a2b3c4" fontSize="12">{fmt(value, high - low < 3 ? 1 : 0)}</text></g> })}
          {[0, 1, 2].map(i => { const time = start + (end - start) * i / 2; return <text key={i} x={x(time)} y="196" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fill="#a2b3c4" fontSize="12">{new Date(time).toLocaleTimeString('es-AR', { hour12: false })}</text> })}
          <path d={path} fill="none" stroke={channel.color} strokeWidth="2" strokeLinejoin="round" />
          {data.length > 0 && <circle cx={x(data[data.length - 1].time)} cy={y(data[data.length - 1].value)} r="4" fill={channel.color} />}
          {data.length < 2 && <text x="330" y="95" textAnchor="middle" fill="#8b9aab" fontSize="13">Esperando muestras del controlador…</text>}
        </svg><div className="trend-card-foot"><span>{values.length ? `Mín. ${fmt(min, 1)} · Máx. ${fmt(max, 1)} ${channel.unit}` : 'Sin muestras'}</span><span>{controladorVivo ? 'En vivo' : 'Conexión interrumpida'}</span></div>
      </article>
    })}</div><p className="trend-note">Últimos {segundos} segundos recibidos en esta sesión. Las interrupciones de telemetría se muestran como cortes en la curva.</p>
  </section>
}
