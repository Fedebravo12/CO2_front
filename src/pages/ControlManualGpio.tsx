import { Fragment, useState } from 'react'
import type { ComponenteEstado } from '../api/hardware'
import { fmt } from '../components/Meters'
import { FormularioComando } from '../components/FormularioComando'
import { useHardwareGpio, type HardwareGpio } from '../hooks/useHardwareGpio'

/*
 * Control manual con hardware GPIO: la misma pantalla que con el simulador, pero
 * las filas salen de los componentes configurados y de las operaciones que declara
 * la ficha de su driver. No se escribe un caso por driver: se reconoce qué hace
 * cada componente por sus operaciones (encender/apagar, armar/desarmar, abrir/cerrar,
 * pulso, mover). Lo que no encaja en ninguna, igual se puede operar en «Otras».
 */

/** Nombre para el operador según el rol del componente; sin rol, su nombre. */
const ETIQUETA_ROL: Record<string, string> = {
  LASER: 'Láser CO₂', SHUTTER: 'Shutter mecánico', POSICION_MOTOR: 'Desplazador lineal',
  TEMPERATURA_AGUA: 'Temperatura del agua', CAUDAL_REFRIGERANTE: 'Caudal refrigerante',
  TENSION_AT: 'Alta tensión', TEMPERATURA_LASER: 'Temperatura del láser', SENSOR_SOMBRA: 'Sensor de sombra',
}
/** Interruptores: operación para activar, para desactivar y el campo que dice si está activo. */
const PARES = [
  { activar: 'encender', desactivar: 'apagar', campo: 'salida_activa', si: 'Encendido', no: 'Apagado' },
  { activar: 'armar', desactivar: 'desarmar', campo: 'armado', si: 'Armado', no: 'Desarmado' },
] as const
const CONOCIDAS = new Set(['encender', 'apagar', 'armar', 'desarmar', 'abrir', 'cerrar', 'pulso', 'mover', 'mover_a', 'referenciar', 'detener'])
const ETIQUETA_CAMPO: Record<string, string> = {
  activo: 'Entrada', temperatura_c: 'Temperatura', tension_v: 'Tensión', caudal: 'Caudal',
  potencia_mw: 'Potencia', tension_kv: 'Tensión', posicion: 'Posición',
}
const UNIDAD_CAMPO: Record<string, string> = { temperatura_c: '°C', tension_v: 'V', potencia_mw: 'mW', tension_kv: 'kV' }

type Entrada = [string, ComponenteEstado]
export const titulo = ([nombre, c]: Entrada) => (c.rol && ETIQUETA_ROL[c.rol]) || nombre
const esMotor = (c: ComponenteEstado) => 'mover' in c.operaciones || 'mover_a' in c.operaciones

/** Clasifica los componentes vigentes en actuadores, motores y sensores (sin operaciones). */
export function agruparComponentes(componentes: Record<string, ComponenteEstado>) {
  const vigentes = Object.entries(componentes).filter(([, c]) => c.estado === 'Vigente')
  return {
    actuadores: vigentes.filter(([, c]) => !esMotor(c) && Object.keys(c.operaciones).length > 0),
    motores: vigentes.filter(([, c]) => esMotor(c)),
    sensores: vigentes.filter(([, c]) => Object.keys(c.operaciones).length === 0),
  }
}

/** Texto de una lectura: «—» sin datos vigentes o de calidad dudosa. */
function lectura(hw: HardwareGpio, c: ComponenteEstado, campo: string, digitos = 1): string {
  const v = hw.conectado && c.calidad === 'OK' ? c.valores?.[campo] : undefined
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v !== 'number') return '—'
  return `${fmt(v, digitos)}${UNIDAD_CAMPO[campo] ? ` ${UNIDAD_CAMPO[campo]}` : ''}`
}
const activo = (hw: HardwareGpio, c: ComponenteEstado, campo: string) =>
  hw.conectado && c.calidad === 'OK' && c.valores?.[campo] === true

/** Estado de la orden en curso del componente, o el problema de su lectura. */
function aviso(hw: HardwareGpio, nombre: string, c: ComponenteEstado): string | null {
  const pendiente = hw.pendientes[nombre]
  if (pendiente) {
    const resultado = hw.estado?.resultados.find(r => r.id === pendiente.id)
    const sinConfirmar = !resultado && Date.now() - pendiente.desde > 15000
    return sinConfirmar ? 'Sin confirmación del controlador: revise el equipo antes de repetir la orden.'
      : resultado?.estado === 'EJECUTANDO' ? 'Ejecutando…' : 'Esperando confirmación del controlador…'
  }
  // Una orden rechazada o fallida hace poco: el motivo va en la fila del componente.
  const ultima = hw.estado?.resultados.filter(r => r.componente === nombre).at(-1)
  if (ultima && !['APLICADO', 'EN_COLA', 'EJECUTANDO', 'RECIBIDO'].includes(ultima.estado)
    && Date.now() - Date.parse(ultima.ts) < 30000) return `${ultima.estado}: ${ultima.detalle ?? ultima.operacion}`
  if (c.error) return c.error
  if (hw.conectado && c.calidad && c.calidad !== 'OK') return c.calidad === 'VENCIDO' ? 'Lectura vencida' : 'Error de lectura'
  return null
}

function Actuador({ hw, entrada }: { hw: HardwareGpio; entrada: Entrada }) {
  const [nombre, c] = entrada
  const [duracion, setDuracion] = useState(100)
  const ops = c.operaciones
  const ocupado = hw.bloqueado || !!hw.pendientes[nombre] || !!hw.enviando
  const par = PARES.find(p => p.activar in ops && p.desactivar in ops)
  const encendido = par ? activo(hw, c, par.campo) : false
  // Abrir, cerrar y pulso requieren el componente armado, si su ficha lo informa.
  const armado = !('armado' in (c.valores ?? {})) || activo(hw, c, 'armado')
  const abierto = activo(hw, c, 'salida_apertura')
  const otras = Object.entries(ops).filter(([op]) => !CONOCIDAS.has(op))
  const nota = aviso(hw, nombre, c)
  const estadoTexto = par ? (hw.conectado && c.calidad === 'OK' ? (encendido ? par.si : par.no) : 'Sin datos') : c.tipo
  return <>
    <div className="control-row">
      <div>
        <b>{titulo(entrada)}</b>
        <div style={{ color: 'var(--muted)' }}>{estadoTexto} · {nombre}</div>
        {nota && <div role="status" style={{ color: 'var(--muted)', fontSize: 12 }}>{nota}</div>}
      </div>
      {par && <button className={`toggle ${encendido ? 'on' : ''}`} disabled={ocupado}
        onClick={() => hw.ejecutar(nombre, encendido ? par.desactivar : par.activar)}
        aria-label={`${encendido ? 'Desactivar' : 'Activar'} ${titulo(entrada)}`}><i /></button>}
    </div>
    {'abrir' in ops && 'cerrar' in ops && <div className="control-row" style={{ paddingLeft: 16 }}>
      <div>
        <span>Apertura</span>
        <div style={{ color: 'var(--muted)' }}>{armado ? 'Abrir y cerrar a mano' : 'Arme el componente para operarlo'}</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className={!abierto ? 'primary' : 'ghost'} type="button" disabled={ocupado || !armado} onClick={() => hw.ejecutar(nombre, 'cerrar')}>Cerrado</button>
        <button className={abierto ? 'primary' : 'ghost'} type="button" disabled={ocupado || !armado} onClick={() => hw.ejecutar(nombre, 'abrir')}>Abierto</button>
      </div>
    </div>}
    {'pulso' in ops && <div className="control-row" style={{ paddingLeft: 16 }}>
      <div>
        <span>Pulso</span>
        <div style={{ color: 'var(--muted)' }}>Abre durante el tiempo indicado y vuelve a cerrar</div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input className="control-input" type="number" min={1} step={10} value={duracion} aria-label={`Duración del pulso de ${titulo(entrada)} (ms)`}
          onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) setDuracion(Math.max(1, v)) }} />
        <span style={{ color: 'var(--muted)' }}>ms</span>
        <button className="ghost" type="button" disabled={ocupado || !armado} onClick={() => hw.ejecutar(nombre, 'pulso', { duracion_ms: duracion })}>Disparar</button>
      </div>
    </div>}
    {otras.map(([op, argumentos]) => <div key={op} className="control-row" style={{ paddingLeft: 16 }}>
      <span>{op}</span>
      <FormularioComando argumentos={argumentos} etiqueta="Enviar" deshabilitado={ocupado}
        onEnviar={valores => hw.ejecutar(nombre, op, valores)} />
    </div>)}
  </>
}

function Motor({ hw, entrada }: { hw: HardwareGpio; entrada: Entrada }) {
  const [nombre, c] = entrada
  const p = (c.parametros ?? {}) as Record<string, unknown>
  const unidad = typeof p.unidad === 'string' ? p.unidad : ''
  const minimo = typeof p.minimo === 'number' ? p.minimo : -Infinity
  const maximo = typeof p.maximo === 'number' ? p.maximo : Infinity
  const vmax = typeof p.velocidad_maxima === 'number' ? p.velocidad_maxima : 1
  const [modo, setModo] = useState<'relativo' | 'absoluto'>('relativo')
  const [valor, setValor] = useState(1)
  const [velocidad, setVelocidad] = useState(vmax)
  const ops = c.operaciones
  const ocupado = hw.bloqueado || !!hw.pendientes[nombre] || !!hw.enviando
  const crudo = hw.conectado && c.calidad === 'OK' ? c.valores?.posicion : undefined
  const posicion = typeof crudo === 'number' ? crudo : null
  const moviendo = activo(hw, c, 'en_movimiento')
  const referenciado = activo(hw, c, 'referenciado')
  const nota = aviso(hw, nombre, c)
  const conUnidad = (v: number) => `${fmt(v, 2)}${unidad ? ` ${unidad}` : ''}`
  const limitar = (v: number) => Math.min(maximo, Math.max(minimo, v))
  const mover = (delta: number) => hw.ejecutar(nombre, 'mover', { delta, velocidad })
  // El controlador no mueve un eje sin origen declarado: se avisa antes de intentarlo.
  const sinOrigen = 'referenciar' in ops && hw.conectado && c.calidad === 'OK' && !referenciado
  const quieto = ocupado || sinOrigen || velocidad <= 0
  return <section className="panel">
    <h3>{titulo(entrada).toUpperCase()}</h3>
    <div className="control-row">
      <div>
        <span>Posición actual</span>
        <div style={{ color: 'var(--muted)' }}>{moviendo ? 'En movimiento' : referenciado ? 'Con referencia declarada' : 'Sin referencia: la posición es estimada'} · {nombre}</div>
        {nota && <div role="status" style={{ color: 'var(--muted)', fontSize: 12 }}>{nota}</div>}
      </div>
      <b className="mono">{posicion === null ? '—' : conUnidad(posicion)}</b>
    </div>

    <div className="control-row">
      <div>
        <b>Tipo de movimiento</b>
        <div style={{ color: 'var(--muted)' }}>{modo === 'relativo' ? 'Se suma a la posición actual' : 'Va a una posición fija del recorrido'}</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className={modo === 'relativo' ? 'primary' : 'ghost'} type="button" onClick={() => setModo('relativo')}>Relativo</button>
        <button className={modo === 'absoluto' ? 'primary' : 'ghost'} type="button" disabled={!('mover_a' in ops)} onClick={() => setModo('absoluto')}>Absoluto</button>
      </div>
    </div>

    <div className="control-row">
      <span>{modo === 'relativo' ? `Distancia a desplazar (${unidad})` : `Posición destino (${unidad})`}</span>
      <input className="control-input" type="number" step="any" value={valor} disabled={ocupado}
        min={modo === 'absoluto' && Number.isFinite(minimo) ? minimo : 0} max={Number.isFinite(maximo) ? maximo : undefined}
        aria-label={modo === 'relativo' ? 'Distancia a desplazar' : 'Posición destino'}
        onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) setValor(Math.max(0, v)) }} />
    </div>
    <div className="control-row">
      <span>Velocidad ({unidad}/s · máx. {fmt(vmax, 2)})</span>
      <input className="control-input" type="number" step="any" min={0} max={vmax} value={velocidad} disabled={ocupado}
        aria-label="Velocidad" onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) setVelocidad(Math.min(vmax, Math.max(0, v))) }} />
    </div>

    {modo === 'relativo' ? <>
      {sinOrigen && <div className="control-row"><span style={{ color: 'var(--muted)' }}>Declare el origen (abajo) antes de mover el eje.</span></div>}
      {posicion !== null && <div className="control-row">
        <span style={{ color: 'var(--muted)' }}>Quedaría en {conUnidad(limitar(posicion + valor))} (avanzando) o {conUnidad(limitar(posicion - valor))} (retrocediendo)</span>
      </div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="ghost" type="button" disabled={quieto || valor === 0} onClick={() => mover(-valor)}>− Retroceder</button>
        <button className="ghost" type="button" disabled={quieto || valor === 0} onClick={() => mover(valor)}>+ Avanzar</button>
      </div>
    </> : <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      {sinOrigen && <span style={{ color: 'var(--muted)' }}>Declare el origen antes de mover el eje.</span>}
      <button className="ghost" type="button" disabled={quieto} onClick={() => hw.ejecutar(nombre, 'mover_a', { posicion: limitar(valor), velocidad })}>Ir a {conUnidad(limitar(valor))}</button>
    </div>}

    {'referenciar' in ops && <div className="control-row" style={{ marginTop: 16 }}>
      <div>
        <b>Referencia</b>
        <div style={{ color: 'var(--muted)' }}>Declara la posición actual como origen (0 {unidad})</div>
      </div>
      <button className="ghost" type="button" disabled={ocupado || moviendo} onClick={() => hw.ejecutar(nombre, 'referenciar', { posicion: 0 })}>Declarar origen</button>
    </div>}
    {'detener' in ops && <div className="control-row">
      <div>
        <b>Detener</b>
        <div style={{ color: 'var(--muted)' }}>Frena este eje. La parada de emergencia está siempre arriba.</div>
      </div>
      {/* Detener no espera a la orden anterior: es justamente para cortar un movimiento. */}
      <button className="ghost" type="button" disabled={hw.bloqueado || !moviendo} onClick={() => hw.ejecutar(nombre, 'detener')}>Detener</button>
    </div>}
  </section>
}

/** Vista sin efectos: recibe el estado del hardware (así se puede probar sin red). */
export function ControlManualGpioVista({ hw, rol }: { hw: HardwareGpio; rol?: string }) {
  const e = hw.estado
  const { actuadores, motores, sensores } = agruparComponentes(e?.componentes ?? {})
  const revision = e?.revision_aplicada ? `aplicada ${e.revision_aplicada.slice(0, 8)}` : 'sin aplicar'
  return <>
    <h1 className="page-title">Control manual</h1>
    <p style={{ color: 'var(--muted)', marginTop: -8 }}>
      Operación de los componentes configurados para pruebas de secuencia. Cada orden la valida el controlador:
      la pantalla muestra lo que informa el equipo, no lo que se pidió.
    </p>
    <p className="mono" style={{ color: 'var(--muted)' }}>
      Hardware GPIO · {hw.conectado ? 'Conectado' : 'Sin datos vigentes'} · Configuración {revision}
      {e && e.revision_deseada !== e.revision_aplicada ? ' · hay cambios guardados sin aplicar' : ''} · Cola {e?.cola ?? '—'}/{e?.capacidad_cola ?? '—'}
    </p>
    {e?.emergencia && <p role="alert" className="aviso-ctrl warn">Parada enclavada: las órdenes pendientes se cancelaron. Rearme desde la cabecera cuando el equipo esté apagado.</p>}
    {e?.error_configuracion && <p role="alert" className="aviso-ctrl warn">{e.error_configuracion}</p>}
    {hw.error && <p role="alert" className="login-error">{hw.error}</p>}
    {e && !Object.keys(e.componentes).length && <p className="aviso-ctrl">No hay componentes aplicados. Cárguelos en Administración → Configuración de hardware.</p>}

    <div className="cards-2" style={{ marginTop: 16 }}>
      {actuadores.length > 0 && <section className="panel">
        <h3>ACTUADORES</h3>
        {actuadores.map(entrada => <Fragment key={entrada[0]}><Actuador hw={hw} entrada={entrada} /></Fragment>)}
        {rol === 'Operador' && <p style={{ color: 'var(--muted)' }}>Operador: solo dentro de umbrales preconfigurados. No puede redefinir límites.</p>}
      </section>}
      {motores.map(entrada => <Motor key={entrada[0]} hw={hw} entrada={entrada} />)}
      {sensores.length > 0 && <section className="panel">
        <h3>SENSORES</h3>
        {sensores.flatMap(entrada => {
          const [nombre, c] = entrada
          const campos = Object.keys(c.valores ?? {}).filter(k => k !== 'realimentacion')
          return [<div key={nombre} className="control-row"><div><b>{titulo(entrada)}</b><div style={{ color: 'var(--muted)' }}>{c.tipo} · {nombre}</div>
            {aviso(hw, nombre, c) && <div role="status" style={{ color: 'var(--muted)', fontSize: 12 }}>{aviso(hw, nombre, c)}</div>}</div></div>,
          ...campos.map(campo => <div key={`${nombre}-${campo}`} className="control-row" style={{ paddingLeft: 16 }}>
            <span>{ETIQUETA_CAMPO[campo] ?? campo}</span><b className="mono">{lectura(hw, c, campo)}</b></div>)]
        })}
      </section>}
      <section className="panel">
        <h3>ÚLTIMAS ÓRDENES</h3>
        {e?.resultados.length ? <div className="table-wrap"><table><thead><tr><th>Componente</th><th>Operación</th><th>Resultado</th><th>Detalle</th></tr></thead>
          <tbody>{e.resultados.slice(-8).reverse().map(r => <tr key={r.id}>
            <td>{r.componente}</td><td>{r.operacion}</td><td>{r.estado}</td><td>{r.detalle ?? '—'}</td>
          </tr>)}</tbody></table></div>
          : <p style={{ color: 'var(--muted)', margin: 0 }}>Todavía no se enviaron órdenes.</p>}
      </section>
    </div>
  </>
}

/** Con un programa grabando no se opera a mano: el controlador lo rechazaría igual. */
export function ControlManualGpio({ rol, grabando = false }: { rol?: string; grabando?: boolean }) {
  const hw = useHardwareGpio()
  return <ControlManualGpioVista hw={{ ...hw, bloqueado: hw.bloqueado || grabando }} rol={rol} />
}
