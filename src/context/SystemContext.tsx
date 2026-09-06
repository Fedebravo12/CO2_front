import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { PASOS, PROGRAMAS, TELEMETRIA_BASE } from '../mock/data'
import type {
  EstadoSistema,
  PasoProcedimiento,
  Programa,
  Rol,
  Telemetria,
} from '../mock/types'

interface SystemValue {
  rol: Rol
  setRol: (r: Rol) => void
  estado: EstadoSistema
  telemetria: Telemetria
  programa: Programa
  setProgramaId: (id: string) => void
  pasoActual: number
  pasos: PasoProcedimiento[]
  maxAlcanzado: number
  toggleValidacion: (pasoId: number, validId: string) => void
  toggleHardware: (pasoId: number, hwId: string) => void
  confirmarPaso: () => boolean
  irAPaso: (id: number) => void
  iniciarEnsayo: () => void
  resetEnsayo: () => void
  emergencia: () => void
  rearmar: () => void
  now: Date
}

const SystemContext = createContext<SystemValue | null>(null)

function jitter(n: number, amp: number, digits = 1) {
  const v = n + (Math.random() - 0.5) * amp
  return Number(v.toFixed(digits))
}

function clonePasos(): PasoProcedimiento[] {
  return structuredClone(PASOS)
}

export function SystemProvider({ children }: { children: ReactNode }) {
  const [rol, setRol] = useState<Rol>('Operador')
  const [estado, setEstado] = useState<EstadoSistema>('LISTO')
  const [telemetria, setTelemetria] = useState<Telemetria>(TELEMETRIA_BASE)
  const [programaId, setProgramaId] = useState('prg-a')
  const [pasos, setPasos] = useState(clonePasos)
  const [pasoActual, setPasoActual] = useState(1)
  const [maxAlcanzado, setMaxAlcanzado] = useState(1)
  const [now, setNow] = useState(() => new Date())

  const programa = PROGRAMAS.find((p) => p.id === programaId) ?? PROGRAMAS[0]

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      setTelemetria((prev) => {
        const running = estado === 'GRABANDO'
        const prep = estado === 'PREPARACIÓN'
        return {
          ...prev,
          tempLaser: jitter(running ? 36.2 : 21.4, 0.3),
          tempRefrigeracion: jitter(18.7, 0.2),
          caudal: jitter(2.1, 0.08, 2),
          potenciaLaserW: running ? jitter(9.6, 0.4, 2) : 0,
          potenciaMw: running ? jitter(programa.potenciaObjetivoMw, 0.15, 2) : 0,
          sensorSombraMw: prep || running ? jitter(0.12, 0.04, 2) : 0,
          voltajeHv: running ? jitter(1840, 20, 0) : 0,
          frecuenciaHz: running ? jitter(2.5, 0.1, 2) : 0,
          periodoS: running ? jitter(0.4, 0.02, 2) : 0,
          posicionUm: running ? Math.min(10000, prev.posicionUm + 8) : prep ? prev.posicionUm : 0,
          tiempoPulsoMs: programa.duracionPulsoMs,
          canalesActivos: estado === 'EMERGENCIA' ? 0 : 10,
        }
      })
    }, 1000)
    return () => clearInterval(t)
  }, [estado, programa.duracionPulsoMs, programa.potenciaObjetivoMw])

  const toggleValidacion = (pasoId: number, validId: string) => {
    if (estado === 'EMERGENCIA') return
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

  const toggleHardware = (pasoId: number, hwId: string) => {
    if (estado === 'EMERGENCIA') return
    setPasos((all) =>
      all.map((p) => {
        if (p.id !== pasoId) return p
        return {
          ...p,
          hardware: p.hardware.map((h) => {
            if (h.id !== hwId) return h
            const on = h.tono !== 'ok'
            return on
              ? { ...h, tono: 'ok', estado: 'OK' }
              : { ...h, tono: 'warn', estado: 'PENDIENTE' }
          }),
        }
      }),
    )
  }

  const confirmarPaso = () => {
    const paso = pasos.find((p) => p.id === pasoActual)
    if (!paso || estado === 'EMERGENCIA') return false
    if (!paso.validaciones.every((v) => v.verificada)) return false
    if (pasoActual === 7) setEstado('GRABANDO')
    if (pasoActual >= 9) {
      setEstado('LISTO')
      setPasoActual(1)
      setMaxAlcanzado(1)
      setPasos(clonePasos())
      return true
    }
    const next = pasoActual + 1
    setPasoActual(next)
    setMaxAlcanzado((m) => Math.max(m, next))
    return true
  }

  const irAPaso = (id: number) => {
    if (id <= maxAlcanzado && estado !== 'EMERGENCIA') setPasoActual(id)
  }

  const iniciarEnsayo = () => {
    if (estado === 'EMERGENCIA') return
    setEstado('PREPARACIÓN')
    setPasoActual(1)
  }

  const resetEnsayo = () => {
    if (estado === 'EMERGENCIA') return
    setPasos(clonePasos())
    setPasoActual(1)
    setMaxAlcanzado(1)
    setEstado('PREPARACIÓN')
    setTelemetria({ ...TELEMETRIA_BASE, tiempoPulsoMs: programa.duracionPulsoMs })
  }

  const emergencia = () => {
    setEstado('EMERGENCIA')
    setTelemetria((t) => ({
      ...t,
      potenciaLaserW: 0,
      potenciaMw: 0,
      voltajeHv: 0,
      frecuenciaHz: 0,
      canalesActivos: 0,
    }))
  }

  const rearmar = () => {
    setEstado('LISTO')
    setPasos(clonePasos())
    setPasoActual(1)
    setMaxAlcanzado(1)
    setTelemetria(TELEMETRIA_BASE)
  }

  const value = useMemo(
    () => ({
      rol,
      setRol,
      estado,
      telemetria,
      programa,
      setProgramaId,
      pasoActual,
      pasos,
      maxAlcanzado,
      toggleValidacion,
      toggleHardware,
      confirmarPaso,
      irAPaso,
      iniciarEnsayo,
      resetEnsayo,
      emergencia,
      rearmar,
      now,
    }),
    [rol, estado, telemetria, programa, pasoActual, pasos, maxAlcanzado, now],
  )

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>
}

export function useSystem() {
  const ctx = useContext(SystemContext)
  if (!ctx) throw new Error('useSystem fuera de SystemProvider')
  return ctx
}
