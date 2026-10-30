import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Lock } from 'lucide-react'
import type { Accion } from '../api/control'
import { fmt, LinearBar } from '../components/Meters'
import { useSystem } from '../context/SystemContext'
import type { PasoGuiado, ValidacionPaso } from '../mock/types'
import { estadoDe, evaluar, fuentesDe, type Fuentes } from '../procedimientos/interprete'

const INICIAR = new Set(['iniciar_real', 'iniciar_prueba'])

/** Fases del indicador superior: tramos seguidos de pasos con la misma fase. */
function fasesDe(pasos: PasoGuiado[]): { nombre: string; desde: number; hasta: number }[] {
  const fases: { nombre: string; desde: number; hasta: number }[] = []
  for (const p of pasos) {
    const ultima = fases[fases.length - 1]
    if (ultima && ultima.nombre === p.fase) ultima.hasta = p.orden
    else fases.push({ nombre: p.fase, desde: p.orden, hasta: p.orden })
  }
  return fases
}

/** Una validación con su detalle desplegable («¿Cómo se hace?»). */
function FilaValidacion({
  v,
  ok,
  porSensor,
  avisoSensor,
  onToggle,
  onAyudaSensor,
}: {
  v: ValidacionPaso
  ok: boolean
  porSensor: boolean
  avisoSensor: boolean
  onToggle: () => void
  onAyudaSensor: () => void
}) {
  const [abierta, setAbierta] = useState(false)
  const idDetalle = useId()
  const ayuda = ok
    ? 'Lo confirma el sensor, no se puede destildar a mano. Si la condición se pierde, se destilda sola. Para revertirla, usá la acción del paso o Control manual.'
    : 'Se tilda sola cuando el sensor confirma la condición. No hace falta marcarla a mano.'

  return (
    <div className={`valid-item ${abierta ? 'abierta' : ''}`}>
      <div className="valid-linea">
        {porSensor ? (
          // Sin `disabled`: el gris nativo hace pensar que está destildado. Se ve
          // como un checkbox normal y el clic se bloquea acá, mostrando la ayuda.
          <label className={`valid-row auto ${ok ? 'on' : ''} ${avisoSensor ? 'mostrar-ayuda' : ''}`}>
            <input
              type="checkbox"
              checked={ok}
              readOnly
              aria-readonly="true"
              aria-describedby={`ayuda-${v.id}`}
              onClick={(e) => {
                e.preventDefault()
                onAyudaSensor()
              }}
            />
            {v.texto}
            <em>
              <Lock size={11} aria-hidden="true" />
              {ok ? 'Verificado por sensor' : 'Esperando sensor'}
            </em>
            <span className="ayuda-sensor" role="tooltip" id={`ayuda-${v.id}`}>
              {ayuda}
            </span>
          </label>
        ) : (
          <label className={`valid-row ${ok ? 'on' : ''}`}>
            <input type="checkbox" checked={ok} onChange={onToggle} />
            {v.texto}
            <em>{ok ? 'Verificado' : 'No verificado'}</em>
          </label>
        )}
        {v.detalle && (
          <button
            type="button"
            className="valid-detalle-btn"
            aria-expanded={abierta}
            aria-controls={idDetalle}
            onClick={() => setAbierta((a) => !a)}
          >
            <ChevronDown size={14} aria-hidden="true" />
            <span className="sr-only">{abierta ? 'Ocultar' : 'Ver'} cómo se hace: </span>
            ¿Cómo?
          </button>
        )}
      </div>
      {v.detalle && (
        <div className="valid-detalle" id={idDetalle} hidden={!abierta}>
          {v.detalle}
        </div>
      )}
    </div>
  )
}

export function NuevoEnsayo() {
  const {
    estado,
    procedimiento,
    errorProcedimiento,
    cargandoProcedimiento,
    pasoActual,
    visitados,
    manuales,
    irAPaso,
    toggleValidacion,
    confirmarPaso,
    programa,
    programas,
    setProgramaId,
    telemetria: tel,
    controlador,
    controladorVivo,
    enviar,
    iniciarPrograma,
    ensayoActual,
    rol,
  } = useSystem()
  const [pickPrograma, setPickPrograma] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // Validación por sensor que el operador intentó cambiar: muestra la ayuda un rato.
  const [avisoSensor, setAvisoSensor] = useState<string | null>(null)
  const timerAviso = useRef<number | undefined>(undefined)
  const mostrarAyuda = (vId: string) => {
    setAvisoSensor(vId)
    window.clearTimeout(timerAviso.current)
    timerAviso.current = window.setTimeout(() => setAvisoSensor(null), 4000)
  }
  useEffect(() => () => window.clearTimeout(timerAviso.current), [])

  const pasos = procedimiento?.pasos ?? []
  const paso = pasos.find((p) => p.orden === pasoActual) ?? pasos[0] ?? null
  const fases = fasesDe(pasos)
  const f: Fuentes | null =
    controlador && controladorVivo ? fuentesDe({ t: controlador, programa, ensayo: ensayoActual }) : null

  const verificada = (v: ValidacionPaso) =>
    v.tipo === 'SENSOR' ? Boolean(f && v.condicion && evaluar(v.condicion, f)) : Boolean(manuales[v.id])
  const todasVerificadas = paso?.validaciones.every(verificada) ?? false
  const cumplido = !paso?.condicionAvance || (f !== null && evaluar(paso.condicionAvance, f))
  // Un procedimiento sin sensores ni comandos (el PEHLPG, por ejemplo) se puede
  // seguir sin el controlador; si usa el equipo, necesita su telemetría.
  const usaEquipo = pasos.some(
    (p) =>
      p.acciones.length > 0 ||
      p.condicionAvance !== null ||
      p.validaciones.some((v) => v.tipo === 'SENSOR'),
  )
  const ready =
    paso !== null && (f !== null || !usaEquipo) && todasVerificadas && cumplido && estado !== 'EMERGENCIA'

  const ejecutar = async (accion: string) => {
    setEnviando(true)
    if (accion === 'iniciar_real') await iniciarPrograma('REAL')
    else if (accion === 'iniciar_prueba') await iniciarPrograma('PRUEBA')
    else await enviar(accion as Accion)
    setEnviando(false)
  }

  const bloqueado = !f || estado === 'EMERGENCIA'
  const grabando = estado === 'GRABANDO'
  const mensaje = controlador?.mensaje
  const ordenGrabado = pasos.find((p) => p.acciones.some((a) => INICIAR.has(a.accion)))?.orden
  const puedeEditar = rol === 'Investigador' || rol === 'Administrador'

  return (
    <>
      <div className="lab-entry"><span>Observá el equipo y las marcas en tiempo real.</span><Link to="/simulador">Ver simulador visual →</Link></div>
      {paso && (
        <ol className="stepper">
          {fases.map((fase, i) => {
            const done = paso.orden > fase.hasta
            const active = paso.orden >= fase.desde && paso.orden <= fase.hasta
            return (
              <li key={`${fase.nombre}-${fase.desde}`} className={`stepper-item ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                <span>{done ? <Check size={14} /> : i + 1}</span>
                <strong>{fase.nombre}</strong>
                {i < fases.length - 1 && <i className="stepper-line" />}
              </li>
            )
          })}
        </ol>
      )}

      <div className="ensayo-grid">
        <aside className="col-card">
          <div className="col-head">
            <h3>PASOS DEL PROCEDIMIENTO</h3>
            {paso && (
              <span className="badge">
                Paso {paso.orden} de {pasos.length}
              </span>
            )}
          </div>
          {procedimiento && (
            <p className="proc-nombre">
              {procedimiento.nombre} <small>v{procedimiento.version}</small>
            </p>
          )}
          {pasos.map((p) => {
            const locked = !visitados.includes(p.orden)
            return (
              <button
                key={p.orden}
                type="button"
                className={`step-item ${p.orden === paso?.orden ? 'active' : ''} ${visitados.includes(p.orden) && p.orden !== paso?.orden ? 'done' : ''}`}
                disabled={locked}
                onClick={() => irAPaso(p.orden)}
              >
                <span className="step-num">{p.orden}</span>
                <span>
                  {p.titulo}
                  <small>{p.subtitulo}</small>
                </span>
                {locked && <Lock className="lock" size={14} />}
              </button>
            )
          })}
        </aside>

        {!paso ? (
          <section className="col-card paso">
            <h2>Sin procedimiento</h2>
            {cargandoProcedimiento ? (
              <p>Cargando el procedimiento del programa…</p>
            ) : errorProcedimiento ? (
              <p className="aviso-ctrl error">No se pudo cargar el procedimiento: {errorProcedimiento}</p>
            ) : !programa ? (
              <p>Elegí un programa de grabado para ver su procedimiento.</p>
            ) : (
              <p>
                El programa <b>{programa.nombre}</b> no tiene un procedimiento guiado asignado.{' '}
                {puedeEditar ? (
                  <>
                    Asignale uno desde <Link to="/programas">Programas de grabado</Link>.
                  </>
                ) : (
                  'Pedile a un investigador o administrador que le asigne uno.'
                )}
              </p>
            )}
          </section>
        ) : (
        <section className="col-card paso">
          <h2>
            {paso.orden}. {paso.titulo}
          </h2>
          {paso.subtitulo && <p>{paso.subtitulo}</p>}

          {mensaje && <p className={`aviso-ctrl ${mensaje.nivel}`}>{mensaje.texto}</p>}

          {paso.indicadores.length > 0 && (
            <div className="hw-row">
              {paso.indicadores.map((ind, i) => {
                const chip = f ? estadoDe(ind, f) : { texto: 'SIN DATOS', tono: 'neutral' as const }
                return (
                  <div key={`${ind.nombre}-${i}`} className="hw-card">
                    <b>{ind.nombre}</b>
                    <span className={`chip ${chip.tono}`}>{chip.texto}</span>
                  </div>
                )
              })}
            </div>
          )}

          {paso.acciones.length > 0 && (
            <div className="acciones-paso">
              {paso.acciones.map((a) => {
                const esAbortar = a.accion === 'abortar'
                const deshabilitado =
                  bloqueado ||
                  enviando ||
                  (esAbortar ? !grabando : grabando) ||
                  (INICIAR.has(a.accion) && !programa)
                return (
                  <button
                    key={a.accion}
                    type="button"
                    className={a.accion === 'iniciar_real' ? 'primary' : 'ghost'}
                    disabled={deshabilitado}
                    onClick={() => ejecutar(a.accion)}
                  >
                    {a.etiqueta}
                  </button>
                )
              })}
            </div>
          )}

          <div className="valid">
            <h4>VALIDACIONES DEL PASO</h4>
            {paso.validaciones.map((v) => (
              <FilaValidacion
                key={v.id}
                v={v}
                ok={verificada(v)}
                porSensor={v.tipo === 'SENSOR'}
                avisoSensor={avisoSensor === v.id}
                onToggle={() => toggleValidacion(v.id)}
                onAyudaSensor={() => mostrarAyuda(v.id)}
              />
            ))}
          </div>

          {paso.salidas.length > 0 ? (
            <div className="salidas-paso">
              {paso.salidas.map((s) => {
                const destino = pasos.find((p) => p.orden === s.destino)
                return (
                  <button
                    key={`${s.etiqueta}-${s.destino}`}
                    className="cta"
                    type="button"
                    disabled={!ready}
                    onClick={() => confirmarPaso(s.destino)}
                  >
                    {s.etiqueta} → <small>Paso {s.destino}{destino ? `: ${destino.titulo}` : ''}</small>
                  </button>
                )
              })}
            </div>
          ) : (
            <button className="cta" type="button" disabled={!ready} onClick={() => confirmarPaso()}>
              {paso.orden >= pasos.length ? 'Finalizar procedimiento →' : 'Confirmar y continuar →'}
            </button>
          )}

          {ensayoActual && ordenGrabado !== undefined && paso.orden >= ordenGrabado && (
            <div className="resultado-ensayo">
              {ensayoActual.resultado ? (
                <>
                  Ensayo <b>{ensayoActual.registro}</b> {ensayoActual.resultado.estado.toLowerCase()}
                  {ensayoActual.modo === 'REAL' && <> · red {ensayoActual.resultado.codigoLpg}</>}
                  {ensayoActual.resultado.lambda && (
                    <>
                      {' '}
                      · λ {ensayoActual.resultado.lambda}, L {ensayoActual.resultado.l}
                    </>
                  )}
                  {' · '}
                  <Link to={`/registro/${ensayoActual.registro}`}>ver detalle →</Link>
                </>
              ) : (
                <>
                  Ensayo <b>{ensayoActual.registro}</b> en curso…
                </>
              )}
            </div>
          )}
        </section>
        )}

        <aside style={{ display: 'grid', gap: 12 }}>
          <div className="col-card">
            <div className="col-head">
              <h3>PROGRAMA DE GRABADO</h3>
              <button className="ghost" type="button" disabled={grabando} onClick={() => setPickPrograma((v) => !v)}>
                Cambiar programa
              </button>
            </div>
            {!programa ? (
              <p style={{ color: 'var(--orange)', margin: 0 }}>
                No hay programas cargados. Un investigador o administrador puede crearlos desde
                «Programas de grabado».
              </p>
            ) : (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>{programa.nombre}</p>
                <p className="proc-del-programa">
                  Procedimiento: <b>{programa.procedimientoNombre || 'sin asignar'}</b>
                </p>
                {pickPrograma && (
                  <div className="kv" style={{ marginBottom: 12 }}>
                    {programas.map((p) => (
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
                      {programa.criterioFin} · {fmt(programa.distanciaMm)} mm
                    </b>
                  </div>
                  <div>
                    <span>Pulsos estimados</span>
                    <b>{programa.pulsosEstimados} pulsos</b>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="col-card">
            <div className="col-head">
              <h3>
                <i className="live-dot" />
                TELEMETRÍA PRINCIPAL (EN VIVO)
              </h3>
              <span className="pill">{controladorVivo ? `${fmt(tel.actualizacionHz, 1)} Hz` : 'SIN DATOS'}</span>
            </div>
            <div className="mini-grid">
              {[
                ['Potencia', `${fmt(tel.potenciaMw)} mW`, tel.potenciaMw, Math.max(20, (programa?.potenciaObjetivoMw ?? 10) * 1.5)],
                ['Temp. láser', `${fmt(tel.tempLaser, 1)} °C`, tel.tempLaser, 80],
                ['Temp. refr.', `${fmt(tel.tempRefrigeracion, 1)} °C`, tel.tempRefrigeracion, 40],
                ['Pos. despl.', `${fmt(tel.posicionUm, 0)} µm`, tel.posicionUm, Math.max(10000, (programa?.distanciaMm ?? 10) * 1000)],
                ['Alta tensión', `${fmt(tel.voltajeHv / 1000, 1)} kV`, tel.voltajeHv / 1000, 30],
                ['Sensor som.', `${fmt(tel.sensorSombraMw)} mW`, tel.sensorSombraMw, 3],
              ].map(([label, val, raw, max]) => (
                <div key={String(label)} className="mini">
                  <label>{label}</label>
                  <b>{val}</b>
                  <LinearBar value={Number(raw)} min={0} max={Number(max)} color="var(--teal)" />
                </div>
              ))}
            </div>
            {controlador?.ejecucion && (
              <div style={{ marginTop: 12 }}>
                <label style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {controlador.ejecucion.programa} · {controlador.ejecucion.pulso}/{controlador.ejecucion.pulsos} pulsos ·{' '}
                  {fmt(controlador.ejecucion.distancia_mm)} mm
                </label>
                <LinearBar value={controlador.ejecucion.progreso * 100} min={0} max={100} color="var(--green)" />
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  )
}
