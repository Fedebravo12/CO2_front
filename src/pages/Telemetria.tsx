import { Aperture, MoveHorizontal, Snowflake, Sun, Target, Zap } from 'lucide-react'
import { Gauge, LinearBar, fmt } from '../components/Meters'
import { useSystem } from '../context/SystemContext'
import { TendenciasTelemetria } from '../components/TendenciasTelemetria'

export function Telemetria() {
  const { telemetria: t, controlador: c, controladorVivo } = useSystem()
  const a = controladorVivo ? c?.actuadores : undefined
  const cond = controladorVivo ? c?.condiciones : undefined
  const sinDatos = { estado: 'Sin datos', tono: 'neutral' as const }

  // Estado de cada subsistema leído de los actuadores y sensores del controlador.
  const subs: {
    nombre: string
    estado: string
    tono: 'ok' | 'info' | 'warn' | 'neutral'
    detalle?: string
    ico: typeof Sun
  }[] = [
    {
      nombre: 'LÁSER',
      ...(a ? (a.laser ? { estado: 'Encendido', tono: 'ok' as const } : { estado: 'Apagado', tono: 'neutral' as const }) : sinDatos),
      detalle: a?.laser ? `${fmt(t.potenciaLaserW, 1)} W` : undefined,
      ico: Sun,
    },
    {
      nombre: 'SHUTTER',
      ...(a
        ? a.shutter_abierto
          ? { estado: 'Abierto', tono: 'info' as const }
          : a.shutter_armado
            ? { estado: 'Armado', tono: 'ok' as const }
            : { estado: 'Desarmado', tono: 'neutral' as const }
        : sinDatos),
      ico: Aperture,
    },
    {
      nombre: 'ALTA TENSIÓN',
      ...(a ? (cond?.AT_ENCENDIDA ? { estado: 'Activa', tono: 'ok' as const } : { estado: 'Apagada', tono: 'neutral' as const }) : sinDatos),
      detalle: a?.alta_tension ? `${fmt(t.voltajeHv / 1000, 1)} kV` : undefined,
      ico: Zap,
    },
    {
      nombre: 'SENSOR DE SOMBRA',
      ...(cond ? (cond.FIBRA_ALINEADA ? { estado: 'Alineado', tono: 'ok' as const } : { estado: 'No alineado', tono: 'warn' as const }) : sinDatos),
      detalle: `${fmt(t.sensorSombraMw)} mW`,
      ico: Target,
    },
    {
      nombre: 'REFRIGERACIÓN',
      ...(a
        ? cond?.REFRIGERACION_OK
          ? { estado: 'Estable', tono: 'ok' as const }
          : a.refrigeracion
            ? { estado: 'Estabilizando', tono: 'warn' as const }
            : { estado: 'Apagada', tono: 'neutral' as const }
        : sinDatos),
      detalle: `${fmt(t.tempRefrigeracion, 1)}°C`,
      ico: Snowflake,
    },
    {
      nombre: 'DESPLAZADOR',
      ...(c?.ejecucion ? { estado: 'En curso', tono: 'info' as const } : { estado: t.posicionUm < 1 ? 'Pos. inicial' : 'Detenido', tono: 'ok' as const }),
      detalle: `${fmt(t.posicionUm, 0)} µm`,
      ico: MoveHorizontal,
    },
  ]

  const gauges = [
    { title: 'POTENCIA LÁSER', value: t.potenciaLaserW, unit: 'W', min: 0, max: 30, color: '#4aa3ff', digits: 2 },
    { title: 'TEMPERATURA REFRIGERACIÓN', value: t.tempRefrigeracion, unit: '°C', min: 0, max: 40, color: '#2ad4c4', digits: 1 },
    { title: 'CAUDAL REFRIGERANTE', value: t.caudal, unit: 'L/min', min: 0, max: 5, color: '#3ee089', digits: 1 },
    { title: 'SENSOR DE SOMBRA', value: t.sensorSombraMw, unit: 'mW', min: 0, max: 3, color: '#f5c542', digits: 2 },
  ]

  const linears = [
    { title: 'POSICIÓN DESPLAZADOR', value: t.posicionUm, unit: 'µm', min: 0, max: 300000, color: '#3ee089', digits: 0, extra: 'Carrera del desplazador: 300 mm' },
    { title: 'ALTA TENSIÓN', value: t.voltajeHv / 1000, unit: 'kV', min: 0, max: 30, color: '#fb923c', digits: 1, extra: t.voltajeHv > 1000 ? 'HV ON' : 'HV OFF' },
    { title: 'FRECUENCIA DE PULSO', value: t.frecuenciaHz, unit: 'Hz', min: 0, max: 5, color: '#4aa3ff', digits: 2, extra: c?.ejecucion ? `${c.ejecucion.pulso}/${c.ejecucion.pulsos} pulsos` : 'Sin grabar' },
    { title: 'EVOLUCIÓN DEL PROCESO', value: (c?.ejecucion?.progreso ?? 0) * 100, unit: '%', min: 0, max: 100, color: '#2ad4c4', digits: 0, extra: c?.ejecucion ? c.ejecucion.programa : '', isProgress: true },
  ]

  return (
    <>
      <div className="subsys-grid">
        {subs.map((s) => (
          <article key={s.nombre} className={`subsys ${s.tono}`}>
            <div>
              <h3>{s.nombre}</h3>
              <div className="subsys-row">
                <p>{s.estado}</p>
                {s.detalle && <span className="subsys-detalle">{s.detalle}</span>}
              </div>
            </div>
            <div className="subsys-ico">
              <s.ico size={20} />
            </div>
          </article>
        ))}
      </div>

      <section className="panel">
        
        <div className="gauge-grid">
          {gauges.map((g) => (
            <article key={g.title} className="meter-card">
              <h4>{g.title}</h4>
              <Gauge value={g.value} min={g.min} max={g.max} color={g.color} />
              <div className="meter-val" style={{ color: g.color }}>
                {controladorVivo ? fmt(g.value, g.digits) : '—'} <span className="meter-unit">{g.unit}</span>
              </div>
              <div className="range">
                {g.min}–{g.max} {g.unit}
              </div>
            </article>
          ))}
        </div>

        <div className="gauge-grid">
          {linears.map((g) => (
            <article key={g.title} className="meter-card lin">
              <h4>{g.title}</h4>
              <div className="meter-val" style={{ color: g.color }}>
                {controladorVivo ? fmt(g.value, g.digits) : '—'} <span className="meter-unit">{g.unit}</span>
              </div>
              {g.extra && <div className="range">{g.extra}</div>}
              <LinearBar value={g.value} min={g.min} max={g.max} color={g.color} />
              <div className="range">
                {g.min} a {g.max} {g.unit}
              </div>
            </article>
          ))}
        </div>
        <div className="panel-head">
          {/* <h3>SENSORES</h3> */}
          <div className="pills">
            <span className="pill">
              CANALES ACTIVOS: {t.canalesActivos}/{t.canalesTotales}
            </span>
            <span className="pill">Muestreo: {t.muestreoMs}ms</span>
            <span className="pill">Actualización: {fmt(t.actualizacionHz, 1)} Hz</span>
          </div>
        </div>
      </section>
      <TendenciasTelemetria />
    </>
  )
}
