import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { control } from '../api/control'
import { hardwareApi, type HardwareEstado } from '../api/hardware'

const ETIQUETAS: Record<string, string> = {
  armar: 'Armar', desarmar: 'Desarmar', abrir: 'Abrir', cerrar: 'Cerrar',
  encender: 'Encender', apagar: 'Apagar', mover: 'Mover', referenciar: 'Declarar posición de referencia',
  deshabilitar: 'Deshabilitar', salida_activa: 'Salida eléctrica activa',
  salida_apertura: 'Salida de apertura activa', armado: 'Armado', activo: 'Entrada activa',
  temperatura_c: 'Temperatura (°C)', tension_v: 'Tensión medida (V)',
  posicion_estimada_mm: 'Posición estimada (mm)', referenciado: 'Referencia declarada',
  habilitado: 'Motor habilitado',
}

export function HardwareManual({ soloLectura = false }: { soloLectura?: boolean }) {
  const [estado, setEstado] = useState<HardwareEstado | null>(null)
  const [errorConexion, setErrorConexion] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)
  const [posiciones, setPosiciones] = useState<Record<string, string>>({})
  const [pendientes, setPendientes] = useState<Record<string, { id: string; desde: number }>>({})
  const ultima = useRef(0)

  useEffect(() => {
    const abortar = new AbortController()
    let temporizador: ReturnType<typeof setTimeout>
    const actualizar = async () => {
      try {
        const datos = await hardwareApi.estado(abortar.signal)
        if (abortar.signal.aborted) return
        setEstado(datos)
        ultima.current = Date.now()
        setErrorConexion('')
        setPendientes(prev => Object.fromEntries(Object.entries(prev).filter(([, pendiente]) => {
          const resultado = datos.resultados.find(r => r.id === pendiente.id)
          return (!resultado || ['EN_COLA', 'EJECUTANDO'].includes(resultado.estado))
            && Date.now() - pendiente.desde < 620000
        })))
      } catch (e) {
        if (!abortar.signal.aborted) setErrorConexion((e as Error).message)
      } finally {
        if (!abortar.signal.aborted) temporizador = setTimeout(actualizar, 500)
      }
    }
    void actualizar()
    const vigilancia = setInterval(() => {
      if (ultima.current && Date.now() - ultima.current > 3500) setErrorConexion('Los datos del controlador vencieron.')
    }, 1000)
    return () => { abortar.abort(); clearTimeout(temporizador); clearInterval(vigilancia) }
  }, [])

  const conectado = !!estado && !errorConexion && Date.now() - ultima.current < 3500
  const bloqueado = !conectado || !estado?.revision_aplicada || estado.emergencia || estado.aplicando
  const ejecutar = async (nombre: string, operacion: string, necesitaPosicion: boolean) => {
    if (!estado?.revision_aplicada || bloqueado || enviando || pendientes[nombre]) return
    setEnviando(nombre)
    setError('')
    try {
      const texto = posiciones[nombre] ?? ''
      if (necesitaPosicion && (!texto.trim() || !Number.isFinite(Number(texto)))) {
        throw new Error('Ingrese una posición válida en milímetros.')
      }
      const r = await hardwareApi.comando(nombre, operacion,
        necesitaPosicion ? { posicion_mm: Number(texto) } : {}, estado.revision_aplicada)
      setPendientes(prev => ({ ...prev, [nombre]: { id: r.id, desde: Date.now() } }))
    } catch (e) { setError((e as Error).message) }
    finally { setEnviando(null) }
  }
  const sistema = async (accion: 'emergencia' | 'rearmar') => {
    if (accion === 'rearmar' && (!conectado || !estado?.emergencia)) return
    setError('')
    try { await control.comando(accion) }
    catch (e) { setError((e as Error).message) }
  }

  return <>
    <h1>{soloLectura ? 'Telemetría de componentes' : 'Control manual por componente'}</h1>
    <p>Modo GPIO · {conectado ? 'Conectado' : 'Sin datos vigentes'} · Cola {estado?.cola ?? '—'}/{estado?.capacidad_cola ?? '—'}</p>
    <p>Las salidas muestran la orden eléctrica aplicada. La posición del motor es estimada por pasos.</p>
    {!soloLectura && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <button className="primary" type="button" style={{ background: '#b91c1c' }} onClick={() => sistema('emergencia')}>Detener todos los componentes</button>
      <button className="ghost" type="button" disabled={!conectado || !estado?.emergencia} onClick={() => sistema('rearmar')}>Rearmar después del apagado</button>
      <Link to="/admin/hardware">Configurar componentes</Link>
    </div>}
    {estado?.emergencia && <p role="alert" className="aviso-ctrl warn">Parada enclavada. Las órdenes pendientes fueron canceladas; espere el apagado antes de rearmar.</p>}
    {estado?.error_configuracion && <p role="alert" className="aviso-ctrl warn">{estado.error_configuracion}</p>}
    {(error || errorConexion) && <p role="alert" className="login-error">{error || errorConexion}</p>}
    <p>Configuración: {estado?.revision_aplicada ? `aplicada ${estado.revision_aplicada.slice(0, 8)}` : 'sin aplicar'}
      {estado?.revision_deseada !== estado?.revision_aplicada && ' · hay cambios pendientes'}</p>
    <div className="cards-2">
      {Object.entries(estado?.componentes ?? {}).map(([nombre, c]) => {
        const inactivo = c.estado !== 'Vigente'
        const pendiente = pendientes[nombre]
        const resultado = pendiente && estado?.resultados.find(r => r.id === pendiente.id)
        return <section className="panel" key={nombre}>
          <h2>{nombre}</h2>
          <p>{c.tipo} · {inactivo ? 'Inhabilitado' : !conectado ? 'SIN CONEXIÓN' : c.calidad ?? 'SIN DATOS'}</p>
          {c.error && <p role="alert">{c.error}</p>}
          <dl>{Object.entries(c.valores ?? {}).filter(([k]) => k !== 'realimentacion').map(([k, v]) => <div key={k} className="control-row">
            <dt>{ETIQUETAS[k] ?? k}</dt><dd>{!conectado || c.calidad !== 'OK' ? '—' : typeof v === 'boolean' ? v ? 'Sí' : 'No' : v ?? '—'}</dd>
          </div>)}</dl>
          {c.ts && <small>Última lectura: {new Date(c.ts).toLocaleTimeString()}</small>}
          {!soloLectura && !inactivo && <>
            {c.tipo === 'STEPPER_DRV8825' && <div className="field">
              <label htmlFor={`pos-${nombre}`}>Posición (mm)</label>
              <input id={`pos-${nombre}`} type="number" min={0} max={Number(c.parametros?.carrera_max_mm ?? 300)} step="any"
                value={posiciones[nombre] ?? ''} onChange={e => setPosiciones(p => ({ ...p, [nombre]: e.target.value }))} />
              <small>Para referenciar, sitúe primero el eje físicamente en la posición indicada. Esta acción no mueve el motor.</small>
            </div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              {Object.entries(c.operaciones).map(([op, args]) => <button type="button" className="ghost" key={op}
                disabled={bloqueado || !!pendiente || !!enviando}
                onClick={() => ejecutar(nombre, op, 'posicion_mm' in args)}>{ETIQUETAS[op] ?? op}</button>)}
            </div>
            {pendiente && <p role="status">{resultado?.estado ?? 'Esperando recepción del controlador…'}
              {!resultado && Date.now() - pendiente.desde > 15000 && ' No se recibió confirmación; no repita la orden sin revisar el equipo.'}</p>}
          </>}
        </section>
      })}
    </div>
    {estado && !Object.keys(estado.componentes).length && <p>No hay componentes aplicados. Cargue una configuración válida en Administración.</p>}
    <section className="panel" style={{ marginTop: 20 }}>
      <h2>Últimas órdenes</h2>
      <div className="table-wrap"><table><thead><tr><th>Componente</th><th>Operación</th><th>Resultado</th><th>Detalle</th></tr></thead>
        <tbody>{estado?.resultados.slice(-12).reverse().map(r => <tr key={r.id}>
          <td>{r.componente}</td><td>{ETIQUETAS[r.operacion] ?? r.operacion}</td><td>{r.estado}</td><td>{r.detalle ?? '—'}</td>
        </tr>)}</tbody></table></div>
    </section>
  </>
}
