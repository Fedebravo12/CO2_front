import { Aperture, MoveHorizontal, Snowflake, Sun, Target, Zap } from 'lucide-react'
import { Gauge, LinearBar, fmt } from '../components/Meters'
import { useSystem } from '../context/SystemContext'

export function Inicio() {
  const { telemetria: t } = useSystem()

  const subs = [
    { nombre: 'LÁSER', estado: t.potenciaLaserW > 0.2 ? 'Encendido' : 'Apagado', tono: 'neutral' as const, ico: Sun },
    { nombre: 'SHUTTER', estado: 'Cerrado', tono: 'neutral' as const, ico: Aperture },
    { nombre: 'ALTA TENSIÓN', estado: t.voltajeHv > 10 ? 'Activa' : 'Apagada', tono: 'neutral' as const, ico: Zap },
    {
      nombre: 'SENSOR DE SOMBRA',
      estado: t.sensorSombraMw > 0.05 ? 'Alineado' : 'No alineado',
      detalle: `${fmt(t.sensorSombraMw)} mW`,
      tono: 'warn' as const,
      ico: Target,
    },
    {
      nombre: 'REFRIGERACIÓN',
      estado: 'Estable',
      detalle: `${fmt(t.tempRefrigeracion, 1)}°C`,
      tono: 'info' as const,
      ico: Snowflake,
    },
    {
      nombre: 'DESPLAZADOR',
      estado: t.posicionUm < 1 ? 'Pos. inicial' : 'En curso',
      detalle: `${fmt(t.posicionUm, 0)} µm`,
      tono: 'ok' as const,
      ico: MoveHorizontal,
    },
  ]

  const gauges = [
    { title: 'POTENCIA LÁSER', value: t.potenciaLaserW, unit: 'W', min: 0, max: 50, color: '#4aa3ff', digits: 2 },
    { title: 'TEMPERATURA REFRIGERACIÓN', value: t.tempRefrigeracion, unit: '°C', min: 0, max: 40, color: '#2ad4c4', digits: 1 },
    { title: 'CAUDAL REFRIGERANTE', value: t.caudal, unit: 'L/min', min: 0, max: 5, color: '#3ee089', digits: 1 },
    { title: 'SENSOR DE SOMBRA', value: t.sensorSombraMw, unit: 'mW', min: 0, max: 10, color: '#f5c542', digits: 2 },
  ]

  const linears = [
    { title: 'POSICIÓN DESPLAZADOR', value: t.posicionUm, unit: 'µm', min: 0, max: 10000, color: '#3ee089', digits: 0, extra: '' },
    { title: 'VOLTAJE ALTA TENSIÓN', value: t.voltajeHv, unit: 'V', min: 0, max: 3000, color: '#fb923c', digits: 0, extra: t.voltajeHv > 10 ? 'HV ON' : 'HV OFF' },
    { title: 'FRECUENCIA DE PULSO', value: t.frecuenciaHz, unit: 'Hz', min: 0, max: 100, color: '#4aa3ff', digits: 0, extra: 'Modulación' },
    { title: 'EVOLUCIÓN DEL PROCESO', value: Math.min(100, Math.max(0, (t.periodoS / 10) * 100)), unit: '%', min: 0, max: 100, color: '#2ad4c4', digits: 0, extra: '', isProgress: true },
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
                {fmt(g.value, g.digits)} <span className="meter-unit">{g.unit}</span>
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
                {fmt(g.value, g.digits)} <span className="meter-unit">{g.unit}</span>
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
    </>
  )
}
