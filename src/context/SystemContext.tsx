import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../api/client'
import {
  aTelemetria,
  control,
  estadoFront,
  type Accion,
  type TelemetriaControlador,
} from '../api/control'
import { useTelemetriaControlador } from '../hooks/useTelemetriaControlador'
import { PASOS, TELEMETRIA_BASE } from '../mock/data'
import type { Ensayo, EstadoSistema, PasoProcedimiento, Programa, Rol, Telemetria } from '../mock/types'
import { useAuth } from './AuthContext'

/**
 * Estado de la conexión. `null` = todavía no se sabe.
 *
 * - `api`: responde `/api/healthz/` (MySQL y Redis arriba).
 * - `controlador`: su heartbeat está vigente **y** llega telemetría. Puede caerse
 *   con la API funcionando (ADR-0002), y el front tiene que mostrarlo.
 */
export interface Conexion {
  api: boolean | null
  controlador: boolean | null
}

/** El ensayo que se lanzó desde «Nuevo ensayo» y, cuando termina, cómo terminó. */
export interface EnsayoActual {
  registro: string
  red: string | null
  modo: 'REAL' | 'PRUEBA'
  resultado: Ensayo | null
}

const INTERVALO_SALUD_MS = 5000

interface SystemValue {
  /** Rol del usuario de la sesión. Lo define el backend. */
  rol: Rol
  conexion: Conexion
  estado: EstadoSistema
  /** Telemetría en vivo, traducida al formato de las pantallas. */
  telemetria: Telemetria
  /** El mensaje crudo del controlador: condiciones, actuadores, ejecución. */
  controlador: TelemetriaControlador | null
  historialTelemetria: TelemetriaControlador[]
  /** `true` mientras llega telemetría. Sin ella, los comandos se bloquean. */
  controladorVivo: boolean
  programas: Programa[]
  /** `null` si todavía no hay programas cargados en el backend. */
  programa: Programa | null
  setProgramaId: (id: string) => void
  recargarProgramas: () => Promise<void>
  /** Manda un comando. Devuelve `false` y deja el motivo en `errorComando` si falla. */
  enviar: (accion: Accion, extra?: Record<string, unknown>) => Promise<boolean>
  iniciarPrograma: (modo: 'REAL' | 'PRUEBA') => Promise<boolean>
  errorComando: string | null
  ensayoActual: EnsayoActual | null
  // Procedimiento guiado de «Nuevo ensayo»
  pasoActual: number
  pasos: PasoProcedimiento[]
  maxAlcanzado: number
  toggleValidacion: (pasoId: number, validId: string) => void
  confirmarPaso: () => void
  irAPaso: (id: number) => void
  reiniciarProcedimiento: () => void
  emergencia: () => void
  rearmar: () => void
  now: Date
}

const SystemContext = createContext<SystemValue | null>(null)

function clonePasos(): PasoProcedimiento[] {
  return structuredClone(PASOS)
}

const TELEMETRIA_SIN_DATOS: Telemetria = { ...TELEMETRIA_BASE, canalesActivos: 0, tempLaser: 0, tempRefrigeracion: 0, caudal: 0 }

export function SystemProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const rol: Rol = usuario?.rol ?? 'Operador'
  const { telemetria: controlador, vivo } = useTelemetriaControlador()
  const [historialTelemetria, setHistorialTelemetria] = useState<TelemetriaControlador[]>([])
  useEffect(() => {
    if (!controlador || !vivo) return
    const timestamp = Date.parse(controlador.ts)
    if (!Number.isFinite(timestamp)) return
    setHistorialTelemetria(previous => {
      if (previous[previous.length - 1]?.ts === controlador.ts) return previous
      return [...previous.filter(sample => Date.parse(sample.ts) >= timestamp - 120000), controlador].slice(-600)
    })
  }, [controlador, vivo])
  const [salud, setSalud] = useState<Conexion>({ api: null, controlador: null })
  const [programas, setProgramas] = useState<Programa[]>([])
  const [programaId, setProgramaId] = useState<string | null>(null)
  const [pasos, setPasos] = useState(clonePasos)
  const [pasoActual, setPasoActual] = useState(1)
  const [maxAlcanzado, setMaxAlcanzado] = useState(1)
  const [errorComando, setErrorComando] = useState<string | null>(null)
  const [ensayoActual, setEnsayoActual] = useState<EnsayoActual | null>(null)
  const [now, setNow] = useState(() => new Date())
  const vioGrabando = useRef(false)

  const programa = programas.find((p) => p.id === programaId) ?? programas[0] ?? null
  const estado = estadoFront(controlador, vivo)

  const recargarProgramas = useCallback(async () => {
    setProgramas(await api.listarProgramas())
  }, [])

  useEffect(() => {
    recargarProgramas().catch(() => setProgramas([]))
  }, [recargarProgramas])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // El healthcheck es público: responde aunque la sesión haya vencido, y
  // devuelve 503 con el detalle cuando falta MySQL o Redis.
  useEffect(() => {
    const consultar = async () => {
      try {
        const r = await fetch('/api/healthz/')
        const cuerpo = await r.json()
        setSalud({ api: r.ok, controlador: Boolean(cuerpo?.dependencias?.controlador?.ok) })
      } catch {
        setSalud({ api: false, controlador: false })
      }
    }
    consultar()
    const t = setInterval(consultar, INTERVALO_SALUD_MS)
    return () => clearInterval(t)
  }, [])

  // Cuando el programa lanzado deja de ejecutarse, se busca cómo quedó el
  // registro. El servicio de eventos lo cierra un instante después que el
  // controlador, así que se reintenta hasta que deje de estar «En curso».
  useEffect(() => {
    if (!ensayoActual || ensayoActual.resultado) return
    if (controlador?.ejecucion?.registro === ensayoActual.registro) {
      vioGrabando.current = true
      return
    }
    if (!vioGrabando.current || !controlador) return
    let intentos = 0
    let cancelado = false
    const consultar = async () => {
      const e = await api.obtenerEnsayo(ensayoActual.registro).catch(() => null)
      if (cancelado) return
      if (e && e.estado !== 'En curso') {
        setEnsayoActual((a) => (a ? { ...a, resultado: e } : a))
      } else if (++intentos < 10) {
        setTimeout(consultar, 800)
      }
    }
    consultar()
    return () => {
      cancelado = true
    }
  }, [controlador, ensayoActual])

  const enviar = useCallback(async (accion: Accion, extra: Record<string, unknown> = {}) => {
    setErrorComando(null)
    try {
      await control.comando(accion, extra)
      return true
    } catch (e) {
      setErrorComando((e as Error).message)
      return false
    }
  }, [])

  const iniciarPrograma = useCallback(
    async (modo: 'REAL' | 'PRUEBA') => {
      if (!programa) return false
      setErrorComando(null)
      try {
        const r = await control.iniciar(programa.id, modo)
        vioGrabando.current = false
        setEnsayoActual({ registro: r.registro, red: r.red, modo, resultado: null })
        return true
      } catch (e) {
        setErrorComando((e as Error).message)
        return false
      }
    },
    [programa],
  )

  const toggleValidacion = (pasoId: number, validId: string) => {
    setPasos((all) =>
      all.map((p) =>
        p.id !== pasoId
          ? p
          : {
              ...p,
              validaciones: p.validaciones.map((v) =>
                v.id === validId ? { ...v, verificada: !v.verificada } : v,
              ),
            },
      ),
    )
  }

  const reiniciarProcedimiento = useCallback(() => {
    setPasos(clonePasos())
    setPasoActual(1)
    setMaxAlcanzado(1)
    setEnsayoActual(null)
    vioGrabando.current = false
  }, [])

  // Quien decide si el paso está cumplido es la pantalla, que conoce los
  // sensores de cada uno; acá solo se avanza.
  const confirmarPaso = () => {
    if (pasoActual >= 9) {
      reiniciarProcedimiento()
      return
    }
    const next = pasoActual + 1
    setPasoActual(next)
    setMaxAlcanzado((m) => Math.max(m, next))
  }

  const irAPaso = (id: number) => {
    if (id <= maxAlcanzado) setPasoActual(id)
  }

  const telemetria = useMemo(
    () =>
      controlador && vivo
        ? aTelemetria(controlador, {
            ...TELEMETRIA_BASE,
            tiempoPulsoMs: programa?.duracionPulsoMs ?? TELEMETRIA_BASE.tiempoPulsoMs,
          })
        : TELEMETRIA_SIN_DATOS,
    [controlador, vivo, programa?.duracionPulsoMs],
  )

  const conexion: Conexion = {
    api: salud.api,
    controlador: salud.controlador === null ? null : Boolean(salud.controlador && vivo),
  }

  const value = {
    rol,
    conexion,
    estado,
    telemetria,
    controlador,
    historialTelemetria,
    controladorVivo: vivo,
    programas,
    programa,
    setProgramaId,
    recargarProgramas,
    enviar,
    iniciarPrograma,
    errorComando,
    ensayoActual,
    pasoActual,
    pasos,
    maxAlcanzado,
    toggleValidacion,
    confirmarPaso,
    irAPaso,
    reiniciarProcedimiento,
    emergencia: () => void enviar('emergencia'),
    rearmar: () => void enviar('rearmar'),
    now,
  }

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>
}

export function useSystem() {
  const ctx = useContext(SystemContext)
  if (!ctx) throw new Error('useSystem fuera de SystemProvider')
  return ctx
}
