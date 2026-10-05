import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Lock } from 'lucide-react'
import type { Accion, TelemetriaControlador } from '../api/control'
import { FASES } from '../mock/data'
import type { HardwarePaso, Programa } from '../mock/types'
import { fmt, LinearBar } from '../components/Meters'
import { useSystem, type EnsayoActual } from '../context/SystemContext'

type T = TelemetriaControlador

interface Contexto {
  t: T
  programa: Programa | null
  ensayo: EnsayoActual | null
}

/** Cómo se ve un chip de hardware a partir de la telemetría. */
type Chip = Pick<HardwarePaso, 'estado' | 'tono'>

/**
 * Lo que conecta cada paso del procedimiento con el equipo:
 * - `acciones`: los botones que mandan comandos al controlador.
 * - `hardware`: el estado de cada chip, leído de los sensores.
 * - `sensores`: las validaciones que un sensor puede confirmar. Las que no
 *   están acá las verifica el operador mirando (por ejemplo, el interlock físico).
 * - `cumplido`: qué tiene que ser cierto en el equipo para poder avanzar.
 */
interface Cableado {
  acciones?: { etiqueta: string; accion: Accion | 'iniciar_real' | 'iniciar_prueba' }[]
  hardware: Record<string, (c: Contexto) => Chip>
  sensores?: Record<string, (c: Contexto) => boolean>
  cumplido: (c: Contexto) => boolean
}

const on = (ok: boolean, si: string, no: string, tonoNo: Chip['tono'] = 'warn'): Chip =>
  ok ? { estado: si, tono: 'ok' } : { estado: no, tono: tonoNo }

const terminado = (c: Contexto) => Boolean(c.ensayo?.resultado)

const CABLEADO: Record<number, Cableado> = {
  1: {
    hardware: {
      fibra: () => ({ estado: 'VERIFICAR', tono: 'info' }),
      interrogador: () => ({ estado: 'CONECTADO', tono: 'ok' }),
    },
    sensores: { v2: () => true, v3: () => true },
    cumplido: () => true,
  },
  2: {
    acciones: [{ etiqueta: 'Encender refrigeración', accion: 'encender_refrigeracion' }],
    hardware: {
      chiller: ({ t }) => on(t.actuadores.refrigeracion, 'ENCENDIDO', 'APAGADO', 'neutral'),
      caudal: ({ t }) =>
        on(
          t.variables.CAUDAL_REFRIGERANTE >= 2,
          `${fmt(t.variables.CAUDAL_REFRIGERANTE)} L/min`,
          `${fmt(t.variables.CAUDAL_REFRIGERANTE)} L/min`,
        ),
    },
    sensores: {
      v1: ({ t }) => t.actuadores.refrigeracion,
      v2: ({ t }) => t.variables.CAUDAL_REFRIGERANTE >= 2,
      v3: ({ t }) => t.condiciones.REFRIGERACION_OK,
    },
    cumplido: ({ t }) => t.condiciones.REFRIGERACION_OK,
  },
  3: {
    hardware: {
      programa: ({ programa }) => on(Boolean(programa), programa?.nombre ?? '', 'SIN PROGRAMA'),
      criterio: ({ programa }) =>
        programa
          ? { estado: `${fmt(programa.distanciaMm)} mm · ${programa.pulsosEstimados} pulsos`, tono: 'info' }
          : { estado: '—', tono: 'neutral' },
    },
    sensores: { v1: ({ programa }) => Boolean(programa), v3: ({ programa }) => Boolean(programa?.criterioFin) },
    cumplido: ({ programa }) => Boolean(programa),
  },
  4: {
    acciones: [{ etiqueta: 'Habilitar alta tensión', accion: 'habilitar_at' }],
    hardware: {
      'hv-hw': () => ({ estado: 'VERIFICAR', tono: 'info' }),
      'hv-sw': ({ t }) =>
        on(
          t.condiciones.AT_ENCENDIDA,
          `HABILITADA ${fmt(t.variables.TENSION_AT, 1)} kV`,
          t.actuadores.alta_tension ? `RAMPA ${fmt(t.variables.TENSION_AT, 1)} kV` : 'APAGADA',
          'neutral',
        ),
    },
    sensores: { v2: ({ t }) => t.condiciones.AT_ENCENDIDA },
    cumplido: ({ t }) => t.condiciones.AT_ENCENDIDA,
  },
  5: {
    acciones: [{ etiqueta: 'Alinear fibra', accion: 'alinear_fibra' }],
    hardware: {
      pd: ({ t }) =>
        t.condiciones.FIBRA_ALINEADA
          ? { estado: 'ALINEADO', tono: 'ok' }
          : t.actuadores.alineando
            ? { estado: 'ALINEANDO…', tono: 'info' }
            : { estado: 'NO ALINEADO', tono: 'warn' },
      'pd-val': ({ t }) =>
        on(t.extra.sensor_sombra_mw < 0.2, `${fmt(t.extra.sensor_sombra_mw)} mW`, `${fmt(t.extra.sensor_sombra_mw)} mW`, 'neutral'),
    },
    sensores: {
      v1: ({ t }) => t.actuadores.alineando || t.condiciones.FIBRA_ALINEADA,
      v2: ({ t }) => t.condiciones.FIBRA_ALINEADA,
      v3: ({ t }) => t.extra.sensor_sombra_mw < 0.2,
    },
    cumplido: ({ t }) => t.condiciones.FIBRA_ALINEADA,
  },
  6: {
    acciones: [{ etiqueta: 'Armar shutter', accion: 'armar_shutter' }],
    hardware: {
      shutter: ({ t }) => on(t.actuadores.shutter_armado, 'ARMADO', 'DESARMADO'),
      interlock: ({ t }) => on(t.senales.SHUTTER_CERRADO, 'CERRADO DETECTADO', 'ABIERTO', 'danger'),
    },
    sensores: {
      v1: ({ t }) => t.actuadores.shutter_armado,
      v2: ({ t }) => t.actuadores.shutter_armado && t.senales.SHUTTER_CERRADO,
    },
    cumplido: ({ t }) => t.estado === 'LISTO',
  },
  7: {
    acciones: [{ etiqueta: 'Encender láser y cerrar lazo', accion: 'encender_laser' }],
    hardware: {
      laser: ({ t }) => on(t.actuadores.laser, `ENCENDIDO ${fmt(t.variables.POTENCIA_LASER, 1)} W`, 'APAGADO', 'neutral'),
      lazo: ({ t }) => on(t.actuadores.lazo_cerrado, 'CERRADO', 'ABIERTO'),
    },
    sensores: {
      v1: ({ t }) => t.estado === 'LISTO',
      v2: ({ t }) => t.actuadores.laser,
      v3: ({ t }) => t.actuadores.lazo_cerrado,
    },
    cumplido: ({ t }) => t.actuadores.laser,
  },
  8: {
    acciones: [
      { etiqueta: 'Pre-grabado (láser inhibido)', accion: 'iniciar_prueba' },
      { etiqueta: 'Iniciar grabado', accion: 'iniciar_real' },
      { etiqueta: 'Abortar', accion: 'abortar' },
    ],
    hardware: {
      loop: ({ t, ensayo }) =>
        t.estado === 'GRABANDO'
          ? { estado: t.ejecucion?.modo === 'PRUEBA' ? 'PRE-GRABADO' : 'GRABANDO', tono: 'info' }
          : ensayo?.resultado
            ? {
                estado: ensayo.resultado.estado.toUpperCase(),
                tono: ensayo.resultado.estado === 'Completado' ? 'ok' : 'danger',
              }
            : { estado: 'DETENIDO', tono: 'neutral' },
      progreso: ({ t, programa }) =>
        t.ejecucion
          ? { estado: `${t.ejecucion.pulso} / ${t.ejecucion.pulsos} pulsos`, tono: 'info' }
          : { estado: `0 / ${programa?.pulsosEstimados ?? 0} pulsos`, tono: 'neutral' },
    },
    sensores: {
      v2: ({ t, ensayo }) => (t.ejecucion?.pulso ?? 0) >= 1 || Boolean(ensayo?.resultado),
      v3: (c) => terminado(c) && c.ensayo?.resultado?.estado === 'Completado',
    },
    cumplido: (c) => terminado(c) && c.ensayo?.modo === 'REAL',
  },
  9: {
    acciones: [{ etiqueta: 'Apagar en orden inverso', accion: 'apagar' }],
    hardware: {
      'laser-off': ({ t }) =>
        on(!t.actuadores.laser && !t.actuadores.alta_tension, 'APAGADO', 'ENCENDIDO', 'danger'),
      registro: ({ ensayo }) => on(Boolean(ensayo?.resultado), ensayo?.registro ?? '', 'SIN GUARDAR', 'neutral'),
    },
    sensores: {
      v1: ({ t }) => !t.actuadores.laser && !t.actuadores.alta_tension,
      v2: ({ t }) => !t.actuadores.shutter_armado,
      v3: ({ ensayo }) => Boolean(ensayo?.resultado),
    },
    cumplido: ({ t }) => t.estado === 'REPOSO',
  },
}

export function NuevoEnsayo() {
  const {
    estado,
    pasos,
    pasoActual,
    maxAlcanzado,
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
  } = useSystem()
  const [pickPrograma, setPickPrograma] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const paso = pasos.find((p) => p.id === pasoActual)!
  const cableado = CABLEADO[paso.id]
  const ctx: Contexto | null =
    controlador && controladorVivo ? { t: controlador, programa, ensayo: ensayoActual } : null

  const verificada = (vId: string, manual: boolean) => {
    const sensor = cableado.sensores?.[vId]
    return sensor ? (ctx ? sensor(ctx) : false) : manual
  }
  const todasVerificadas = paso.validaciones.every((v) => verificada(v.id, v.verificada))
  const ready = ctx !== null && todasVerificadas && cableado.cumplido(ctx) && estado !== 'EMERGENCIA'

  const ejecutar = async (accion: Accion | 'iniciar_real' | 'iniciar_prueba') => {
    setEnviando(true)
    if (accion === 'iniciar_real') await iniciarPrograma('REAL')
    else if (accion === 'iniciar_prueba') await iniciarPrograma('PRUEBA')
    else await enviar(accion)
    setEnviando(false)
  }

  const bloqueado = !ctx || estado === 'EMERGENCIA'
  const grabando = estado === 'GRABANDO'
  const mensaje = controlador?.mensaje

  return (
    <>
      <div className="lab-entry"><span>Observá el equipo y las marcas en tiempo real.</span><Link to="/simulador">Ver simulador visual →</Link></div>
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

          {mensaje && <p className={`aviso-ctrl ${mensaje.nivel}`}>{mensaje.texto}</p>}

          <div className="hw-row">
            {paso.hardware.map((h) => {
              const chip: Chip =
                ctx && cableado.hardware[h.id] ? cableado.hardware[h.id](ctx) : { estado: 'SIN DATOS', tono: 'neutral' }
              return (
                <div key={h.id} className="hw-card">
                  <b>{h.nombre}</b>
                  <span className={`chip ${chip.tono}`}>{chip.estado}</span>
                </div>
              )
            })}
          </div>

          {cableado.acciones && (
            <div className="acciones-paso">
              {cableado.acciones.map((a) => {
                const esAbortar = a.accion === 'abortar'
                const deshabilitado =
                  bloqueado ||
                  enviando ||
                  (esAbortar ? !grabando : grabando) ||
                  (a.accion.startsWith('iniciar') && !programa)
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
            {paso.validaciones.map((v) => {
              const porSensor = Boolean(cableado.sensores?.[v.id])
              const ok = verificada(v.id, v.verificada)
              return (
                <label key={v.id} className={`valid-row ${ok ? 'on' : ''} ${porSensor ? 'auto' : ''}`}>
                  <input
                    type="checkbox"
                    checked={ok}
                    disabled={porSensor}
                    onChange={() => toggleValidacion(paso.id, v.id)}
                  />
                  {v.label}
                  <em>
                    {porSensor ? (ok ? 'Verificado por sensor' : 'Esperando sensor') : ok ? 'Verificado' : 'No verificado'}
                  </em>
                </label>
              )
            })}
          </div>

          <button className="cta" type="button" disabled={!ready} onClick={confirmarPaso}>
            {pasoActual >= 9 ? 'Finalizar procedimiento →' : 'Confirmar y continuar →'}
          </button>

          {ensayoActual && (paso.id === 8 || paso.id === 9) && (
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
                  <LinearBar value={Number(raw)} min={0} max={Number(max)} color="#2ad4c4" />
                </div>
              ))}
            </div>
            {controlador?.ejecucion && (
              <div style={{ marginTop: 12 }}>
                <label style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {controlador.ejecucion.programa} · {controlador.ejecucion.pulso}/{controlador.ejecucion.pulsos} pulsos ·{' '}
                  {fmt(controlador.ejecucion.distancia_mm)} mm
                </label>
                <LinearBar value={controlador.ejecucion.progreso * 100} min={0} max={100} color="#3ee089" />
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  )
}
