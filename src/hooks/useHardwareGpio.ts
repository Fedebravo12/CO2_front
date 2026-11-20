import { useEffect, useRef, useState } from 'react'
import { hardwareApi, type HardwareEstado, type ValorArgumento } from '../api/hardware'

/** Una orden aceptada por la API que todavía no tiene resultado final del controlador. */
export interface Pendiente { id: string; desde: number }

/** Lo que necesita una pantalla para operar componentes GPIO. */
export interface HardwareGpio {
  estado: HardwareEstado | null
  /** Hay datos vigentes del controlador (menos de 3,5 s). */
  conectado: boolean
  /** No se pueden mandar órdenes: sin conexión, sin configuración aplicada, emergencia o aplicando. */
  bloqueado: boolean
  /** Componente cuya orden se está enviando ahora. */
  enviando: string | null
  /** Una orden por componente: hasta que termina, ese componente no acepta otra. */
  pendientes: Record<string, Pendiente>
  error: string
  ejecutar: (componente: string, operacion: string, argumentos?: Record<string, ValorArgumento>) => Promise<void>
}

const VIGENCIA_MS = 3500

/**
 * Estado del hardware GPIO y envío de órdenes por componente.
 *
 * Consulta el estado cada 500 ms. Una orden aceptada por la API queda pendiente
 * hasta que el controlador informa su resultado: mientras tanto el componente no
 * acepta otra, para no repetir una orden física sin saber si se aplicó.
 */
export function useHardwareGpio(): HardwareGpio {
  const [estado, setEstado] = useState<HardwareEstado | null>(null)
  const [errorConexion, setErrorConexion] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)
  const [pendientes, setPendientes] = useState<Record<string, Pendiente>>({})
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
      if (ultima.current && Date.now() - ultima.current > VIGENCIA_MS) setErrorConexion('Los datos del controlador vencieron.')
    }, 1000)
    return () => { abortar.abort(); clearTimeout(temporizador); clearInterval(vigilancia) }
  }, [])

  const conectado = !!estado && !errorConexion && Date.now() - ultima.current < VIGENCIA_MS
  const bloqueado = !conectado || !estado?.revision_aplicada || estado.emergencia || estado.aplicando
  const ejecutar = async (nombre: string, operacion: string, argumentos: Record<string, ValorArgumento> = {}) => {
    if (!estado?.revision_aplicada || bloqueado || enviando || pendientes[nombre]) return
    setEnviando(nombre)
    setError('')
    try {
      const r = await hardwareApi.comando(nombre, operacion, argumentos, estado.revision_aplicada)
      setPendientes(prev => ({ ...prev, [nombre]: { id: r.id, desde: Date.now() } }))
    } catch (e) { setError((e as Error).message) }
    finally { setEnviando(null) }
  }
  return { estado, conectado, bloqueado, enviando, pendientes, error: error || errorConexion, ejecutar }
}
