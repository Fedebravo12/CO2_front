import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, Lock } from 'lucide-react'
import type { Accion } from '../api/control'
import { fmt } from '../components/Meters'
import { channels, EncabezadoCanal, lecturaCanal, useUmbrales } from '../components/canalesTelemetria'
import { useSystem } from '../context/SystemContext'
import type { PasoGuiado, ValidacionPaso } from '../mock/types'
import { comandosDe, estadoDe, evaluar, fuentesDe, type Fuentes } from '../procedimientos/interprete'

const INICIAR = new Set(['iniciar_real', 'iniciar_prueba'])
const OCULTOS = new Set(['pulso', 'sombra', 'hv'])

/** Fases del procedimiento: tramos seguidos de pasos con la misma fase. */
function fasesDe(pasos: PasoGuiado[]): { nombre: string; pasos: PasoGuiado[] }[] {
  const fases: { nombre: string; pasos: PasoGuiado[] }[] = []
  for (const p of pasos) {
    const ultima = fases[fases.length - 1]
    if (ultima && ultima.nombre === p.fase) ultima.pasos.push(p)
    else fases.push({ nombre: p.fase, pasos: [p] })
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
  const ordenGrabado = pasos.find((p) => p.acciones.some((a) => comandosDe(a).some((c) => INICIAR.has(c))))?.orden
  const puedeEditar = rol === 'Investigador' || rol === 'Administrador'

  // Lista de pasos desplegable desde el encabezado de la card.
  const [lista, setLista] = useState(false)
  const cabecera = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!lista) return
    const afuera = (e: PointerEvent) => {
      if (!cabecera.current?.contains(e.target as Node)) setLista(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLista(false)
    }
    document.addEventListener('pointerdown', afuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', afuera)
      document.removeEventListener('keydown', escape)
    }
  }, [lista])
  const ordenActual = paso?.orden
  useEffect(() => setLista(false), [ordenActual])

  // Por qué no se puede avanzar: se muestra debajo del botón de confirmar.
  const faltan = paso ? paso.validaciones.filter((v) => !verificada(v)).length : 0
  const siguiente = paso ? pasos.find((p) => p.orden === paso.orden + 1) : undefined
  const motivo =
    estado === 'EMERGENCIA'
      ? 'Parada de emergencia activa'
      : usaEquipo && !f
        ? 'Sin telemetría del controlador'
        : faltan > 0
          ? `Falta${faltan > 1 ? 'n' : ''} ${faltan} validaci${faltan > 1 ? 'ones' : 'ón'} del paso`
          : !cumplido
            ? 'Esperando que el equipo cumpla la condición del paso'
            : null

  const umbrales = useUmbrales()
  const live = controladorVivo && !!controlador
  // La vista previa muestra los canales del dashboard, sin tiempo de pulso, sensor de sombra ni alta tensión.
  const canales = channels.filter((c) => !OCULTOS.has(c.id))

  return (
    <div className="ensayo-grid">
      <section className="col-card paso">
        {paso && (
          <div ref={cabecera} className="paso-cabecera">
            <button
              type="button"
              className={`paso-selector ${lista ? 'abierta' : ''}`}
              aria-expanded={lista}
              aria-controls="lista-pasos"
              onClick={() => setLista((v) => !v)}
            >
              <span className="paso-selector-linea">
                <span className="paso-selector-orden">
                  PASO {paso.orden} DE {pasos.length}
                  {paso.fase && <> · {paso.fase.toUpperCase()}</>}
                </span>
                <span className="paso-selector-ver">Ver todos los pasos</span>
                <ChevronDown size={16} aria-hidden="true" />
              </span>
              <span className="paso-titulo">{paso.titulo}</span>
              <span className="paso-fases" aria-hidden="true">
                {fases.map((fase, i) => {
                  const activa = fase.pasos.some((p) => p.orden === paso.orden)
                  const hecha = fase.pasos.every((p) => visitados.includes(p.orden) && p.orden !== paso.orden)
                  return (
                    <span
                      key={`${fase.nombre}-${i}`}
                      className={`paso-fase ${activa ? 'active' : hecha ? 'done' : ''}`}
                      style={{ flex: fase.pasos.length }}
                    >
                      <span className="paso-segmentos">
                        {fase.pasos.map((p) => (
                          <i
                            key={p.orden}
                            className={
                              p.orden === paso.orden ? 'active' : visitados.includes(p.orden) ? 'done' : ''
                            }
                          />
                        ))}
                      </span>
                      <span className="paso-fase-nombre">{fase.nombre}</span>
                    </span>
                  )
                })}
              </span>
            </button>

            {lista && (
              <div id="lista-pasos" className="paso-lista">
                <div className="paso-lista-head">
                  <h3>
                    {procedimiento?.nombre.toUpperCase()} <small>v{procedimiento?.version}</small>
                  </h3>
                  <span>Solo podés volver a pasos ya visitados</span>
                </div>
                <div className="paso-lista-fases">
                  {fases.map((fase, i) => {
                    const activa = fase.pasos.some((p) => p.orden === paso.orden)
                    const hecha = fase.pasos.every((p) => visitados.includes(p.orden) && p.orden !== paso.orden)
                    return (
                      <div key={`${fase.nombre}-${i}`}>
                        <div className={`paso-lista-fase ${activa ? 'active' : hecha ? 'done' : ''}`}>
                          {fase.nombre.toUpperCase()}
                        </div>
                        {fase.pasos.map((p) => {
                          const actual = p.orden === paso.orden
                          const locked = !visitados.includes(p.orden)
                          return (
                            <button
                              key={p.orden}
                              type="button"
                              className={`step-item ${actual ? 'active' : locked ? '' : 'done'}`}
                              disabled={locked}
                              aria-current={actual ? 'step' : undefined}
                              onClick={() => irAPaso(p.orden)}
                            >
                              <span className="step-num">{p.orden}</span>
                              <span className="step-titulo">{p.titulo}</span>
                              {actual ? (
                                <span className="badge">Actual</span>
                              ) : locked ? (
                                <Lock className="lock" size={14} aria-label="Bloqueado" />
                              ) : (
                                <Check className="check" size={14} aria-label="Visitado" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="paso-cuerpo">
          {!paso ? (
            <>
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
            </>
          ) : (
            <>
              {paso.subtitulo && <p className="paso-subtitulo">{paso.subtitulo}</p>}

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
                  {paso.acciones.map((a, i) => {
                    if (a.tipo === 'interruptor') {
                      // Sin telemetría no se sabe en qué estado está: queda bloqueado.
                      const encendido = f !== null && evaluar(a.estado, f)
                      const lado = encendido ? a.apagar : a.encender
                      return (
                        <button
                          key={`interruptor-${i}`}
                          type="button"
                          className={`ghost interruptor ${encendido ? 'on' : ''}`}
                          aria-pressed={encendido}
                          disabled={bloqueado || enviando || grabando}
                          onClick={() => ejecutar(lado.accion)}
                        >
                          <i className="interruptor-luz" aria-hidden="true" />
                          {lado.etiqueta}
                        </button>
                      )
                    }
                    const esAbortar = a.accion === 'abortar'
                    const deshabilitado =
                      bloqueado ||
                      enviando ||
                      (esAbortar ? !grabando : grabando) ||
                      (INICIAR.has(a.accion) && !programa)
                    return (
                      <button
                        key={`${a.accion}-${i}`}
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
            </>
          )}
        </div>

        {paso && (
          <div className="paso-pie">
            {paso.salidas.length > 0 ? (
              paso.salidas.map((s) => {
                const destino = pasos.find((p) => p.orden === s.destino)
                return (
                  <button
                    key={`${s.etiqueta}-${s.destino}`}
                    className="cta"
                    type="button"
                    disabled={!ready}
                    onClick={() => confirmarPaso(s.destino)}
                  >
                    <span className="cta-texto">
                      <span className="cta-titulo">{s.etiqueta}</span>
                      <span className="cta-sub">
                        {motivo ?? `Paso ${s.destino}${destino ? ` · ${destino.titulo}` : ''}`}
                      </span>
                    </span>
                    <ArrowRight size={20} aria-hidden="true" />
                  </button>
                )
              })
            ) : (
              <button className="cta" type="button" disabled={!ready} onClick={() => confirmarPaso()}>
                <span className="cta-texto">
                  <span className="cta-titulo">
                    {paso.orden >= pasos.length ? 'Finalizar procedimiento' : 'Confirmar y continuar'}
                  </span>
                  <span className="cta-sub">
                    {motivo ?? (siguiente ? `Siguiente: ${siguiente.orden} · ${siguiente.titulo}` : 'Cierra el ensayo')}
                  </span>
                </span>
                <ArrowRight size={20} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </section>

      <div className="ensayo-lateral">
        <section className="col-card ensayo-programa">
          <div className="col-head">
            <h3>PROGRAMA DE GRABADO</h3>
            <button className="ghost" type="button" disabled={grabando} onClick={() => setPickPrograma((v) => !v)}>
              Cambiar programa
            </button>
          </div>
          {!programa ? (
            <p style={{ color: 'var(--orange)', margin: 0 }}>
              No hay programas cargados. Un investigador o administrador puede crearlos desde «Programas de
              grabado».
            </p>
          ) : (
            <>
              <p className="programa-nombre">{programa.nombre}</p>
              <p className="proc-del-programa">
                Procedimiento: <b>{programa.procedimientoNombre || 'sin asignar'}</b>
              </p>
              {pickPrograma && (
                <div className="programa-opciones">
                  {programas.map((p) => (
                    <button
                      key={p.id}
                      className={`ghost ${p.id === programa.id ? 'on' : ''}`}
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
              <div className="kv kv-filas">
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
        </section>

        <section className="col-card ensayo-telemetria" aria-label="Telemetría en vivo">
          <div className="col-head">
            <h3>
              <i className="live-dot" />
              TELEMETRÍA (EN VIVO)
            </h3>
            <span className="pill">{controladorVivo ? `${fmt(tel.actualizacionHz, 1)} Hz` : 'SIN DATOS'}</span>
          </div>
          <div className="ensayo-canales">
            {canales.map((c) => {
              const l = lecturaCanal(c, controlador, live, umbrales)
              const progreso = Math.min(100, Math.max(0, Number.isFinite(l.crudo) ? l.crudo : 0))
              return (
                <div key={c.id} className={`tc-card ${l.tono}`}>
                  <EncabezadoCanal c={c} badge={l.badge} />
                  <div className="tc-value" style={{ color: l.color }}>
                    {l.valor} <small>{c.unit}</small>
                  </div>
                  {c.id === 'prog' && (
                    <>
                      <div
                        className="tc-progress"
                        role="progressbar"
                        aria-label="Progreso del proceso"
                        aria-valuenow={live ? progreso : undefined}
                      >
                        <i style={{ width: `${live ? progreso : 0}%` }} />
                      </div>
                      {controlador?.ejecucion && (
                        <div className="tc-foot">
                          <span>
                            {controlador.ejecucion.pulso}/{controlador.ejecucion.pulsos} pulsos ·{' '}
                            {fmt(controlador.ejecucion.distancia_mm)} mm
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
