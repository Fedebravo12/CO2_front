import { useEffect, useState } from 'react'
import { Check, Lock } from 'lucide-react'
import { FASES, PROGRAMAS } from '../mock/data'
import { fmt, LinearBar } from '../components/Meters'
import { useSystem } from '../context/SystemContext'

export function NuevoEnsayo() {
  const {
    estado,
    iniciarEnsayo,
    pasos,
    pasoActual,
    maxAlcanzado,
    irAPaso,
    toggleValidacion,
    toggleHardware,
    confirmarPaso,
    programa,
    setProgramaId,
    telemetria: t,
  } = useSystem()
  const [pickPrograma, setPickPrograma] = useState(false)
  const [doneMsg, setDoneMsg] = useState(false)

  useEffect(() => {
    iniciarEnsayo()
    // Solo al entrar a la pantalla: pasa de LISTO a PREPARACIÓN.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const paso = pasos.find((p) => p.id === pasoActual)!
  const ready = paso.validaciones.every((v) => v.verificada) && estado !== 'EMERGENCIA'

  return (
    <>
      <ol className="stepper">
        {FASES.map((fase, i) => {
          const done = paso.fase > i
          const active = paso.fase === i
          return (
            <li key={fase} className={`stepper-item ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
              <span>{done ? <Check size={14} /> : i + 1}</span>
              <strong>{fase}</strong>
              {i < FASES.length - 1 && <i className="stepper-line" />}
            </li>
          )
        })}
      </ol>

      <div className="ensayo-grid">
        <aside className="col-card">
          <div className="col-head">
            <h3>PASOS DEL PROCEDIMIENTO</h3>
            <span className="badge">Paso {pasoActual} de 9</span>
          </div>
          {pasos.map((p) => {
            const locked = p.id > maxAlcanzado
            return (
              <button
                key={p.id}
                type="button"
                className={`step-item ${p.id === pasoActual ? 'active' : ''} ${p.id < pasoActual ? 'done' : ''}`}
                disabled={locked}
                onClick={() => irAPaso(p.id)}
              >
                <span className="step-num">{p.id}</span>
                <span>
                  {p.titulo}
                  <small>{p.subtitulo}</small>
                </span>
                {locked && <Lock className="lock" size={14} />}
              </button>
            )
          })}
        </aside>

        <section className="col-card paso">
          <h2>
            {paso.id}. {paso.titulo}
          </h2>
          <p>{paso.descripcion}</p>

          <div className="hw-row">
            {paso.hardware.map((h) => (
              <button key={h.id} type="button" className="hw-card" onClick={() => toggleHardware(paso.id, h.id)}>
                <b>{h.nombre}</b>
                <span className={`chip ${h.tono}`}>{h.estado}</span>
              </button>
            ))}
          </div>

          <div className="hint">
            <h4>¿QUÉ DEBE HACER?</h4>
            <ul>
              {paso.instrucciones.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>

          <div className="valid">
            <h4>VALIDACIONES DEL PASO</h4>
            {paso.validaciones.map((v) => (
              <label key={v.id} className={`valid-row ${v.verificada ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={v.verificada}
                  onChange={() => toggleValidacion(paso.id, v.id)}
                />
                {v.label}
                <em>{v.verificada ? 'Verificado' : 'No verificado'}</em>
              </label>
            ))}
          </div>

          <button
            className="cta"
            type="button"
            disabled={!ready}
            onClick={() => {
              const last = pasoActual >= 9
              const ok = confirmarPaso()
              if (ok && last) setDoneMsg(true)
            }}
          >
            {pasoActual >= 9 ? 'Finalizar y registrar ensayo →' : 'Confirmar y continuar →'}
          </button>
          {doneMsg && (
            <p style={{ color: 'var(--green)', marginTop: 10 }}>
              Ensayo persistido (simulado). El historial se actualizará cuando exista la API.
            </p>
          )}
        </section>

        <aside style={{ display: 'grid', gap: 12 }}>
          <div className="col-card">
            <div className="col-head">
              <h3>PROGRAMA DE GRABADO</h3>
              <button className="ghost" type="button" onClick={() => setPickPrograma((v) => !v)}>
                Cambiar programa
              </button>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>{programa.nombre}</p>
            {pickPrograma && (
              <div className="kv" style={{ marginBottom: 12 }}>
                {PROGRAMAS.map((p) => (
                  <button
                    key={p.id}
                    className="ghost"
                    type="button"
                    onClick={() => {
                      setProgramaId(p.id)
                      setPickPrograma(false)
                    }}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}
            <div className="kv">
              <div>
                <span>Potencia objetivo</span>
                <b>{fmt(programa.potenciaObjetivoMw)} mW</b>
              </div>
              <div>
                <span>Duración de pulso</span>
                <b>{programa.duracionPulsoMs} ms</b>
              </div>
              <div>
                <span>Desplazamiento</span>
                <b>{programa.desplazamientoUm} µm</b>
              </div>
              <div>
                <span>Criterio de fin</span>
                <b>
                  {programa.criterioFin} {fmt(programa.distanciaMm)} mm
                </b>
              </div>
              <div>
                <span>Pulsos estimados</span>
                <b>{programa.pulsosEstimados} pulsos</b>
              </div>
            </div>
          </div>

          <div className="col-card">
            <div className="col-head">
              <h3>
                <i className="live-dot" />
                TELEMETRÍA PRINCIPAL (EN VIVO)
              </h3>
              <span className="pill">{fmt(t.actualizacionHz, 1)} Hz</span>
            </div>
            <div className="mini-grid">
              {[
                ['Potencia', `${fmt(t.potenciaMw)} mW`, t.potenciaMw, 20],
                ['Temp. láser', `${fmt(t.tempLaser, 1)} °C`, t.tempLaser, 80],
                ['Temp. refr.', `${fmt(t.tempRefrigeracion, 1)} °C`, t.tempRefrigeracion, 40],
                ['Pos. despl.', `${fmt(t.posicionUm, 0)} µm`, t.posicionUm, 10000],
                ['Alta tensión', `${fmt(t.voltajeHv, 0)} V`, t.voltajeHv, 3000],
                ['Sensor som.', `${fmt(t.sensorSombraMw)} mW`, t.sensorSombraMw, 10],
              ].map(([label, val, raw, max]) => (
                <div key={String(label)} className="mini">
                  <label>{label}</label>
                  <b>{val}</b>
                  <LinearBar value={Number(raw)} min={0} max={Number(max)} color="#2ad4c4" />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
