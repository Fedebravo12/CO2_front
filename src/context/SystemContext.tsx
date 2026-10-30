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
import { TELEMETRIA_BASE } from '../mock/data'
import type { Ensayo, EstadoSistema, ProcedimientoGuiado, Programa, Rol, Telemetria } from '../mock/types'
import { comandosDe } from '../procedimientos/interprete'
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
  // Procedimiento guiado de «Nuevo ensayo»: el que tiene asignado el programa.
  procedimiento: ProcedimientoGuiado | null
  /** `null` mientras se carga; `string` con el motivo si no se pudo. */
  errorProcedimiento: string | null
  cargandoProcedimiento: boolean
  /** Número (orden) del paso en pantalla. */
  pasoActual: number
  /** Pasos por los que ya se pasó: se puede volver a ellos desde la lista. */
  visitados: number[]
  /** Validaciones manuales tildadas, por id. */
  manuales: Record<string, boolean>
  toggleValidacion: (validId: string) => void
  /** Cierra el paso y va al siguiente, o a `destino` si es una bifurcación. */
  confirmarPaso: (destino?: number) => void
  irAPaso: (orden: number) => void
  reiniciarProcedimiento: () => void
  emergencia: () => void
  rearmar: () => void
  now: Date
}

const SystemContext = createContext<SystemValue | null>(null)

const INICIAR = new Set(['iniciar_real', 'iniciar_prueba'])

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
  const [procedimiento, setProcedimiento] = useState<ProcedimientoGuiado | null>(null)
  const [errorProcedimiento, setErrorProcedimiento] = useState<string | null>(null)
  const [cargandoProcedimiento, setCargandoProcedimiento] = useState(false)
  const [pasoActual, setPasoActual] = useState(1)
  const [visitados, setVisitados] = useState<number[]>([1])
  const [manuales, setManuales] = useState<Record<string, boolean>>({})
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

  const toggleValidacion = (validId: string) => {
    setManuales((m) => ({ ...m, [validId]: !m[validId] }))
  }

  const reiniciarProcedimiento = useCallback(() => {
    setManuales({})
    setPasoActual(1)
    setVisitados([1])
    setEnsayoActual(null)
    vioGrabando.current = false
  }, [])

  // Cada programa trae su procedimiento. Al cambiar de programa (o si el
  // procedimiento cambió de versión) se empieza de nuevo desde el paso 1.
  const codigoProcedimiento = programa?.procedimiento ?? null
  useEffect(() => {
    let cancelado = false
    reiniciarProcedimiento()
    setErrorProcedimiento(null)
    if (!codigoProcedimiento) {
      setProcedimiento(null)
      return
    }
    setCargandoProcedimiento(true)
    api
      .obtenerProcedimiento(codigoProcedimiento)
      .then((p) => !cancelado && setProcedimiento(p))
      .catch((e: Error) => {
        if (cancelado) return
        setProcedimiento(null)
        setErrorProcedimiento(e.message)
      })
      .finally(() => !cancelado && setCargandoProcedimiento(false))
    return () => {
      cancelado = true
    }
  }, [codigoProcedimiento, programa?.version, reiniciarProcedimiento])

  // Quien decide si el paso está cumplido es la pantalla, que evalúa sus
  // condiciones; acá solo se avanza.
  const confirmarPaso = (destino?: number) => {
    const pasos = procedimiento?.pasos ?? []
    if (destino === undefined) {
      if (pasoActual >= pasos.length) {
        reiniciarProcedimiento()
        return
      }
      destino = pasoActual + 1
    } else {
      // Una bifurcación vuelve a abrir el tramo al que lleva: en el PEHLPG,
      // «Cambio de fibra → Paso 3» es otra fibra, y sus validaciones se repiten.
      const reabiertas = new Set(
        pasos.filter((p) => p.orden >= destino!).flatMap((p) => p.validaciones.map((v) => v.id)),
      )
      setManuales((m) => Object.fromEntries(Object.entries(m).filter(([id]) => !reabiertas.has(id))))
      const pasoGrabado = pasos.find((p) => p.acciones.some((a) => comandosDe(a).some((c) => INICIAR.has(c))))
      if (pasoGrabado && destino <= pasoGrabado.orden) {
        setEnsayoActual(null)
        vioGrabando.current = false
      }
    }
    const siguiente = destino
    setPasoActual(siguiente)
    setVisitados((v) => (v.includes(siguiente) ? v : [...v, siguiente]))
  }

  const irAPaso = (orden: number) => {
    if (visitados.includes(orden)) setPasoActual(orden)
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
    procedimiento,
    errorProcedimiento,
    cargandoProcedimiento,
    pasoActual,
    visitados,
    manuales,
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
